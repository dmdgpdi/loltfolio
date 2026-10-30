import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { MatchRepositoryError } from "../domain/errors/MatchRepositoryError";
import { MatchSyncStartNotAllowedError } from "../domain/errors/MatchSyncStartNotAllowedError";
import { MatchSync } from "../domain/MatchSync";
import { PlayerMatch } from "../domain/PlayerMatch";
import type { MatchSyncRepository } from "../domain/types/MatchSyncRepository.type";
import type { PlayerMatchRepository } from "../domain/types/PlayerMatchRepository.type";
import type { QueueId } from "../domain/types/QueueId.type";
import { createPlayerMatchData } from "../testing/createPlayerMatchData";
import { MatchCollectionError } from "./errors/MatchCollectionError";
import { MatchCollectionFailureSaveError } from "./errors/MatchCollectionFailureSaveError";
import { MatchCollectionService } from "./MatchCollectionService";
import type { RiotMatchClient } from "./RiotMatchClient";

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 29, 0, minutes));
const playerMatch = (matchId: string, puuid = "player") =>
  new PlayerMatch(createPlayerMatchData({ matchId, puuid }));

class MemorySyncRepository implements MatchSyncRepository {
  private readonly states = new Map<string, MatchSync>();

  get state(): MatchSync {
    return this.getState("player", 420);
  }

  set state(sync: MatchSync) {
    this.states.set(JSON.stringify([sync.puuid, sync.queueId]), sync);
  }

  getState(puuid: string, queueId: QueueId): MatchSync {
    const key = JSON.stringify([puuid, queueId]);
    let sync = this.states.get(key);
    if (!sync) {
      sync = new MatchSync(puuid, queueId);
      this.states.set(key, sync);
    }
    return sync;
  }
  saveError: MatchRepositoryError | null = null;
  successSaveError: MatchRepositoryError | null = null;

  async tryStart(puuid: string, queueId: QueueId, now: Date) {
    const candidate = this.getState(puuid, queueId).copy();
    const started = candidate.start(now);
    if (Result.isFailure(started)) return started;
    this.state = candidate.copy();
    return Result.succeed(candidate);
  }

  async update(sync: MatchSync) {
    if (this.saveError) return Result.fail(this.saveError);
    if (sync.status === "SUCCEEDED" && this.successSaveError)
      return Result.fail(this.successSaveError);
    this.state = sync.copy();
    return Result.succeed(undefined);
  }
}

class MemoryMatchRepository implements PlayerMatchRepository {
  records: PlayerMatch[] = [];
  saveError: MatchRepositoryError | null = null;
  readError: MatchRepositoryError | null = null;

  async findByMatchIds(
    puuid: string,
    queueId: QueueId,
    ids: readonly string[],
  ) {
    return this.readError
      ? Result.fail(this.readError)
      : Result.succeed(
          this.records.filter(
            (match) =>
              match.puuid === puuid &&
              match.queueId === queueId &&
              ids.includes(match.matchId),
          ),
        );
  }

  async saveAll(matches: readonly PlayerMatch[]) {
    if (this.saveError) return Result.fail(this.saveError);
    for (const match of matches) {
      if (
        !this.records.some(
          (record) =>
            record.matchId === match.matchId && record.puuid === match.puuid,
        )
      )
        this.records.push(match);
    }
    return Result.succeed(undefined);
  }
}

function setup(client: RiotMatchClient, time = at(0)) {
  const syncs = new MemorySyncRepository();
  const matches = new MemoryMatchRepository();
  const service = new MatchCollectionService(
    syncs,
    matches,
    client,
    () => new Date(time),
  );
  return { syncs, matches, service };
}

function clientFor(ids: readonly string[]): RiotMatchClient {
  return {
    findRecentMatchIds: async () => Result.succeed(ids),
    findPlayerMatch: async (id, puuid) =>
      Result.succeed(playerMatch(id, puuid)),
  };
}

it("기존 경기는 상세 조회를 생략하고 새 경기만 저장해 최근 순서로 반환한다", async () => {
  const client = clientFor(["new", "existing", "new"]);
  client.findPlayerMatch = async (id, puuid) => {
    if (id === "existing") return Result.fail(new MatchCollectionError());
    return Result.succeed(playerMatch(id, puuid));
  };
  const { service, syncs, matches } = setup(client);
  const existing = playerMatch("existing");
  matches.records.push(existing, playerMatch("unrelated", "other"));

  const result = await service.collectRecentMatches("player", 420);

  expect(Result.unwrap(result).map((match) => match.matchId)).toEqual([
    "new",
    "existing",
  ]);
  expect(matches.records).toHaveLength(3);
  expect(matches.records).toContain(existing);
  expect(syncs.state.status).toBe("SUCCEEDED");
  expect(syncs.state.lastSucceededAt).toEqual(at(0));
});

it("외부에 최대 20경기를 요청하고 초과 응답도 20개까지만 수집한다", async () => {
  let requestedCount = 0;
  const client = clientFor(
    Array.from({ length: 25 }, (_, index) => `match-${index}`),
  );
  client.findRecentMatchIds = async (_puuid, _queueId, count) => {
    requestedCount = count;
    return Result.succeed(
      Array.from({ length: 25 }, (_, index) => `match-${index}`),
    );
  };
  const { service, matches } = setup(client);

  const result = await service.collectRecentMatches("player", 420);

  expect(requestedCount).toBe(20);
  expect(Result.unwrap(result)).toHaveLength(20);
  expect(matches.records).toHaveLength(20);
});

it("마지막 성공 후 제한 중에는 외부 API를 호출하지 않는다", async () => {
  let requested = false;
  const client = clientFor([]);
  client.findRecentMatchIds = async () => {
    requested = true;
    return Result.succeed([]);
  };
  const { service, syncs } = setup(client, at(10));
  Result.unwrap(syncs.state.start(at(0)));
  Result.unwrap(syncs.state.succeed(at(0)));

  expect(await service.collectRecentMatches("player", 420)).toEqual(
    Result.fail(expect.any(MatchSyncStartNotAllowedError)),
  );
  expect(requested).toBe(false);
});

it("겹친 수집 요청 중 하나만 시작한다", async () => {
  let release: (
    value: Result.Result<readonly string[], MatchCollectionError>,
  ) => void = () => {};
  const ids = new Promise<
    Result.Result<readonly string[], MatchCollectionError>
  >((resolve) => {
    release = resolve;
  });
  const client = clientFor([]);
  client.findRecentMatchIds = () => ids;
  const { service, syncs } = setup(client);

  const first = service.collectRecentMatches("player", 420);
  const second = await service.collectRecentMatches("player", 420);
  release(Result.succeed([]));

  expect(second).toEqual(
    Result.fail(expect.any(MatchSyncStartNotAllowedError)),
  );
  expect(await first).toEqual(Result.succeed([]));
  expect(syncs.state.status).toBe("SUCCEEDED");
});

it("상세 조회가 실패하면 준비 중인 신규 경기를 저장하지 않고 기존 성공 시각을 유지한다", async () => {
  const client = clientFor(["new", "broken"]);
  const error = new MatchCollectionError({ retryAvailableAt: at(30) });
  client.findPlayerMatch = async (id) =>
    id === "broken" ? Result.fail(error) : Result.succeed(playerMatch(id));
  const { service, syncs, matches } = setup(client, at(20));
  Result.unwrap(syncs.state.start(at(0)));
  Result.unwrap(syncs.state.succeed(at(0)));
  const old = playerMatch("old");
  matches.records.push(old);

  expect(await service.collectRecentMatches("player", 420)).toEqual(
    Result.fail(error),
  );
  expect(matches.records).toEqual([old]);
  expect(syncs.state.status).toBe("FAILED");
  expect(syncs.state.lastSucceededAt).toEqual(at(0));
  expect(syncs.state.retryAvailableAt).toEqual(at(30));
});

it("경기 ID 조회 실패도 실패 상태와 재시도 시각으로 기록한다", async () => {
  const error = new MatchCollectionError({ retryAvailableAt: at(5) });
  const client = clientFor([]);
  client.findRecentMatchIds = async () => Result.fail(error);
  const { service, syncs } = setup(client);

  expect(await service.collectRecentMatches("player", 420)).toEqual(
    Result.fail(error),
  );
  expect(syncs.state.status).toBe("FAILED");
  expect(syncs.state.canStart(at(1))).toBe(false);
});

it.each([
  "read",
  "write",
])("경기 저장소 %s 실패를 반환하고 수집 실패를 기록한다", async (operation) => {
  const { service, matches, syncs } = setup(clientFor(["new"]));
  const error = new MatchRepositoryError();
  if (operation === "read") matches.readError = error;
  else matches.saveError = error;

  expect(await service.collectRecentMatches("player", 420)).toEqual(
    Result.fail(error),
  );
  expect(syncs.state.status).toBe("FAILED");
  expect(matches.records).toEqual([]);
});

it("성공 상태 저장 실패는 실패로 기록하며 저장된 경기는 재사용할 수 있게 보존한다", async () => {
  const { service, syncs, matches } = setup(clientFor(["new"]));
  const error = new MatchRepositoryError();
  syncs.successSaveError = error;

  expect(await service.collectRecentMatches("player", 420)).toEqual(
    Result.fail(error),
  );
  expect(syncs.state.status).toBe("FAILED");
  expect(syncs.state.lastSucceededAt).toBeNull();
  expect(matches.records).toHaveLength(1);
});

it("실패 상태 저장까지 실패하면 원래 실패와 저장 오류를 함께 반환한다", async () => {
  const cause = new MatchCollectionError();
  const client = clientFor([]);
  client.findRecentMatchIds = async () => Result.fail(cause);
  const { service, syncs } = setup(client);
  const saveError = new MatchRepositoryError();
  syncs.saveError = saveError;

  const result = await service.collectRecentMatches("player", 420);

  expect(result).toEqual(
    Result.fail(expect.any(MatchCollectionFailureSaveError)),
  );
  expect(result).toMatchObject({ error: { cause, saveError } });
});

it("다른 플레이어의 상세 기록은 저장하지 않는다", async () => {
  const client = clientFor(["new"]);
  client.findPlayerMatch = async () =>
    Result.succeed(playerMatch("new", "other"));
  const { service, matches } = setup(client);

  expect(await service.collectRecentMatches("player", 420)).toEqual(
    Result.fail(expect.any(MatchCollectionError)),
  );
  expect(matches.records).toEqual([]);
});

it("모두 저장된 경기면 상세 조회 없이 수집 확인을 완료한다", async () => {
  const client = clientFor(["existing"]);
  client.findPlayerMatch = async () => Result.fail(new MatchCollectionError());
  const { service, matches, syncs } = setup(client);
  matches.records.push(playerMatch("existing"));

  expect(
    Result.unwrap(await service.collectRecentMatches("player", 420)),
  ).toEqual(matches.records);
  expect(syncs.state.status).toBe("SUCCEEDED");
});

it("성공 상태 저장 실패 후 재시도하면 이미 저장된 경기를 재수집하지 않는다", async () => {
  const client = clientFor(["new"]);
  const { service, syncs, matches } = setup(client);
  syncs.successSaveError = new MatchRepositoryError();
  await service.collectRecentMatches("player", 420);
  syncs.successSaveError = null;
  client.findPlayerMatch = async () => Result.fail(new MatchCollectionError());

  const result = await service.collectRecentMatches("player", 420);

  expect(result).toEqual(Result.succeed(matches.records));
  expect(matches.records).toHaveLength(1);
  expect(syncs.state.status).toBe("SUCCEEDED");
});

it("경기 ID가 없으면 빈 목록으로 수집 확인을 완료한다", async () => {
  const { service, syncs, matches } = setup(clientFor([]));

  expect(await service.collectRecentMatches("player", 420)).toEqual(
    Result.succeed([]),
  );
  expect(syncs.state.status).toBe("SUCCEEDED");
  expect(matches.records).toEqual([]);
});

it("솔로 랭크의 20분 제한은 자유 랭크 수집을 막지 않는다", async () => {
  const requestedQueues: QueueId[] = [];
  const client = clientFor([]);
  client.findRecentMatchIds = async (_puuid, queueId) => {
    requestedQueues.push(queueId);
    return Result.succeed([]);
  };
  const { service, syncs } = setup(client, at(5));
  Result.unwrap(syncs.state.start(at(0)));
  Result.unwrap(syncs.state.succeed(at(0)));

  const solo = await service.collectRecentMatches("player", 420);
  const flex = await service.collectRecentMatches("player", 440);

  expect(solo).toEqual(Result.fail(expect.any(MatchSyncStartNotAllowedError)));
  expect(flex).toEqual(Result.succeed([]));
  expect(requestedQueues).toEqual([440]);
  expect(syncs.getState("player", 420).lastSucceededAt).toEqual(at(0));
  expect(syncs.getState("player", 440).lastSucceededAt).toEqual(at(5));
});

it("다른 큐의 수집 실패가 기존 큐의 성공 기록을 변경하지 않는다", async () => {
  const error = new MatchCollectionError({ retryAvailableAt: at(10) });
  const client = clientFor([]);
  client.findRecentMatchIds = async () => Result.fail(error);
  const { service, syncs } = setup(client, at(5));
  Result.unwrap(syncs.state.start(at(0)));
  Result.unwrap(syncs.state.succeed(at(0)));

  expect(await service.collectRecentMatches("player", 440)).toEqual(
    Result.fail(error),
  );
  expect(syncs.getState("player", 420).status).toBe("SUCCEEDED");
  expect(syncs.getState("player", 420).lastSucceededAt).toEqual(at(0));
  expect(syncs.getState("player", 440).retryAvailableAt).toEqual(at(10));
});

it("요청한 큐와 다른 경기 상세는 저장하지 않는다", async () => {
  const { service, matches } = setup(clientFor(["solo-match"]));

  expect(await service.collectRecentMatches("player", 440)).toEqual(
    Result.fail(expect.any(MatchCollectionError)),
  );
  expect(matches.records).toEqual([]);
});

it("제외 경기가 있으면 다음 페이지와 기존 DB 기록을 합쳐 유효 20경기를 채운다", async () => {
  const firstPage = [
    "remake",
    ...Array.from({ length: 19 }, (_, i) => `valid-${i}`),
  ];
  const starts: number[] = [];
  const client = clientFor(firstPage);
  client.findRecentMatchIds = async (_puuid, _queueId, _count, start = 0) => {
    starts.push(start);
    return Result.succeed(start === 0 ? firstPage : ["last"]);
  };
  client.findPlayerMatch = async (id) =>
    Result.succeed(
      id === "remake"
        ? new PlayerMatch({
            ...playerMatch(id),
            startedAt: { status: "AVAILABLE", value: at(0) },
            gameEndedInEarlySurrender: { status: "AVAILABLE", value: true },
          })
        : playerMatch(id),
    );
  const { service, matches } = setup(client);
  matches.records.push(playerMatch("valid-0"));
  client.findPlayerMatch = async (id) => {
    if (id === "valid-0") return Result.fail(new MatchCollectionError());
    return Result.succeed(
      id === "remake"
        ? new PlayerMatch({
            ...playerMatch(id),
            startedAt: { status: "AVAILABLE", value: at(0) },
            gameEndedInEarlySurrender: { status: "AVAILABLE", value: true },
          })
        : playerMatch(id),
    );
  };

  const result = Result.unwrap(
    await service.collectRecentMatches("player", 420),
  );

  expect(result).toHaveLength(20);
  expect(result[0].matchId).toBe("valid-0");
  expect(result[19].matchId).toBe("last");
  expect(starts).toEqual([0, 20]);
  expect(matches.records).toHaveLength(21);
  expect(
    matches.records
      .find((match) => match.matchId === "remake")
      ?.isEligibleForAnalysis(),
  ).toBe(false);
});

it("수집할 기록이 더 없으면 확보한 유효 경기만 반환한다", async () => {
  const { service } = setup(clientFor(["one", "two"]));

  expect(
    Result.unwrap(await service.collectRecentMatches("player", 420)),
  ).toHaveLength(2);
});

it("추가 페이지 조회 실패 시 앞 페이지의 신규 기록을 성공으로 저장하지 않는다", async () => {
  const client = clientFor([]);
  client.findRecentMatchIds = async (_puuid, _queueId, _count, start = 0) =>
    start === 0
      ? Result.succeed(Array.from({ length: 20 }, (_, i) => `excluded-${i}`))
      : Result.fail(new MatchCollectionError());
  client.findPlayerMatch = async (id) =>
    Result.succeed(
      new PlayerMatch({
        ...playerMatch(id),
        startedAt: { status: "AVAILABLE", value: at(0) },
        endOfGameResult: { status: "AVAILABLE", value: "AbortUnexpected" },
      }),
    );
  const { service, syncs, matches } = setup(client);

  expect(await service.collectRecentMatches("player", 420)).toEqual(
    Result.fail(expect.any(MatchCollectionError)),
  );
  expect(matches.records).toEqual([]);
  expect(syncs.state.status).toBe("FAILED");
});
