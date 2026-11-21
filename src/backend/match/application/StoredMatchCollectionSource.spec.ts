import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { MatchRepositoryError } from "@/backend/match/domain/errors/MatchRepositoryError";
import { PlayerMatch } from "@/backend/match/domain/PlayerMatch";
import { createPlayerMatchData } from "@/backend/match/testing/createPlayerMatchData";
import { MatchCollectionAttemptError } from "./errors/MatchCollectionAttemptError";
import { MatchCollectionError } from "./errors/MatchCollectionError";
import { MatchCollectionFetcher } from "./MatchCollectionFetcher";
import type { RiotMatchClient } from "./RiotMatchClient";
import { StoredMatchCollectionSource } from "./StoredMatchCollectionSource";

it("최신 목록과 확정 목록 수집을 나누고 캐시를 재사용해 신규 경기만 반환한다", async () => {
  // Arrange
  const cached = match("cached");
  const fresh = match("fresh");
  const client: RiotMatchClient = {
    findRecentMatchIds: async () => Result.succeed(["fresh", "cached"]),
    findPlayerMatch: async (id) =>
      id === "fresh"
        ? Result.succeed(fresh)
        : Result.fail(new MatchCollectionError()),
  };
  const source = new StoredMatchCollectionSource(
    new MatchCollectionFetcher(
      { findByMatchIds: async () => Result.succeed([cached]) },
      client,
    ),
  );

  // Act
  const ids = Result.unwrap(
    await source.findSelection(target, new AbortController().signal),
  );
  const batch = Result.unwrap(
    await source.collectSelection(target, ids, new AbortController().signal),
  );

  // Assert
  expect(ids).toEqual(["fresh", "cached"]);
  expect(batch).toEqual({ matches: [fresh], outcome: { status: "SUCCEEDED" } });
});

it("고정 목록 수집은 최신 목록을 다시 조회하거나 저장하지 않는다", async () => {
  // Arrange
  const cached = match("old");
  const source = sourceFor(
    {
      findRecentMatchIds: async () => {
        throw new Error("최신 목록 조회 금지");
      },
      findPlayerMatch: async () => {
        throw new Error("캐시 상세 재조회 금지");
      },
    },
    [cached],
  );

  // Act
  const batch = await source.collectSelection(
    target,
    ["old"],
    new AbortController().signal,
  );

  // Assert
  expect(batch).toEqual(
    Result.succeed({ matches: [], outcome: { status: "SUCCEEDED" } }),
  );
});

it("최신 목록은 최대 20개를 한 번 요청하며 원래 순서의 중복을 제거한다", async () => {
  // Arrange
  const requested: number[][] = [];
  const source = sourceFor({
    findRecentMatchIds: async (_puuid, _queue, count, options) => {
      requested.push([count, options?.start ?? -1]);
      return Result.succeed([
        "KR_2",
        "KR_1",
        "KR_2",
        ...Array.from({ length: 22 }, (_, i) => `old-${i}`),
      ]);
    },
    findPlayerMatch: async (id) => Result.succeed(match(id)),
  });

  // Act
  const ids = Result.unwrap(
    await source.findSelection(target, new AbortController().signal),
  );

  // Assert
  expect(requested).toEqual([[20, 0]]);
  expect(ids).toEqual([
    "KR_2",
    "KR_1",
    ...Array.from({ length: 17 }, (_, i) => `old-${i}`),
  ]);
});

it("빈 목록은 캐시나 외부 상세를 읽지 않고 성공한다", async () => {
  // Arrange
  const source = new StoredMatchCollectionSource(
    new MatchCollectionFetcher(
      {
        findByMatchIds: async () => {
          throw new Error("DB 조회 금지");
        },
      },
      {
        findRecentMatchIds: async () => Result.succeed([]),
        findPlayerMatch: async () => {
          throw new Error("상세 조회 금지");
        },
      },
    ),
  );

  // Act
  const batch = await source.collectSelection(
    target,
    [],
    new AbortController().signal,
  );

  // Assert
  expect(batch).toEqual(
    Result.succeed({ matches: [], outcome: { status: "SUCCEEDED" } }),
  );
});

it("다른 대상·큐의 캐시는 재사용하지 않고 요청한 경기만 반환한다", async () => {
  // Arrange
  const otherPlayer = new PlayerMatch(
    createPlayerMatchData({ matchId: "KR_1", puuid: "other" }),
  );
  const otherQueue = new PlayerMatch(
    createPlayerMatchData({ matchId: "KR_2", queueId: 440 }),
  );
  const source = sourceFor(clientFor(["KR_1", "KR_2"]), [
    otherPlayer,
    otherQueue,
    match("unselected"),
  ]);

  // Act
  const batch = Result.unwrap(
    await source.collectSelection(
      target,
      ["KR_2", "KR_1"],
      new AbortController().signal,
    ),
  );

  // Assert
  expect(batch.matches.map((record) => record.matchId)).toEqual([
    "KR_2",
    "KR_1",
  ]);
  expect(
    batch.matches.every(
      (record) => record.puuid === "player" && record.queueId === 420,
    ),
  ).toBe(true);
});

it("분석 제외 경기도 신규 캐시로 반환하고 같은 경기를 다시 수집하지 않게 한다", async () => {
  // Arrange
  const excluded = new PlayerMatch(
    createPlayerMatchData({
      matchId: "excluded",
      gameEndedInEarlySurrender: { status: "AVAILABLE", value: true },
    }),
  );
  const source = sourceFor({
    ...clientFor(["excluded"]),
    findPlayerMatch: async () => Result.succeed(excluded),
  });

  // Act
  const batch = Result.unwrap(
    await source.collectSelection(
      target,
      ["excluded"],
      new AbortController().signal,
    ),
  );

  // Assert
  expect(batch.matches).toEqual([excluded]);
  expect(batch.outcome.status).toBe("SUCCEEDED");
  expect(batch.matches[0].isEligibleForAnalysis()).toBe(false);
});

it("경기는 최대 두 개씩 요청하고 응답 순서가 달라도 고정 목록 순서를 유지한다", async () => {
  // Arrange
  const first = Promise.withResolvers<PlayerMatch>();
  const second = Promise.withResolvers<PlayerMatch>();
  const started = Promise.withResolvers<void>();
  const requested: string[] = [];
  let active = 0;
  let maximum = 0;
  const source = sourceFor({
    ...clientFor([]),
    findPlayerMatch: async (id) => {
      requested.push(id);
      active++;
      maximum = Math.max(maximum, active);
      if (requested.length === 2) started.resolve();
      const record =
        id === "first"
          ? await first.promise
          : id === "second"
            ? await second.promise
            : match(id);
      active--;
      return Result.succeed(record);
    },
  });

  // Act
  const pending = source.collectSelection(
    target,
    ["first", "second", "third"],
    new AbortController().signal,
  );
  await started.promise;
  const initial = [...requested];
  second.resolve(match("second"));
  first.resolve(match("first"));
  const batch = Result.unwrap(await pending);

  // Assert
  expect(initial).toEqual(["first", "second"]);
  expect(maximum).toBe(2);
  expect(batch.matches.map((record) => record.matchId)).toEqual([
    "first",
    "second",
    "third",
  ]);
});

it.each([
  new MatchCollectionError({ reason: "HTTP", status: 404 }),
  new MatchCollectionError({ reason: "HTTP", status: 503 }),
  new MatchCollectionError({ reason: "TIMEOUT" }),
  new MatchCollectionError({ reason: "REQUEST_FAILED" }),
])("개별 경기 오류 %j는 확보한 기록과 부분 성공을 반환한다", async (error) => {
  // Arrange
  const source = sourceFor({
    ...clientFor([]),
    findPlayerMatch: async (id) =>
      id === "missing" ? Result.fail(error) : Result.succeed(match(id)),
  });

  // Act
  const batch = Result.unwrap(
    await source.collectSelection(
      target,
      ["valid", "missing"],
      new AbortController().signal,
    ),
  );

  // Assert
  expect(batch.matches.map((record) => record.matchId)).toEqual(["valid"]);
  expect(batch.outcome).toEqual({ status: "PARTIALLY_SUCCEEDED" });
});

it("모든 신규 조회가 실패하고 재사용 기록도 없으면 빈 성공으로 만들지 않는다", async () => {
  // Arrange
  const source = sourceFor({
    ...clientFor([]),
    findPlayerMatch: async () =>
      Result.fail(new MatchCollectionError({ reason: "TIMEOUT" })),
  });

  // Act
  const batch = Result.unwrap(
    await source.collectSelection(
      target,
      ["missing"],
      new AbortController().signal,
    ),
  );

  // Assert
  expect(batch).toEqual({
    matches: [],
    outcome: {
      status: "FAILED",
      failure: { code: "COLLECTION_FAILED", retryAvailableAt: null },
    },
  });
});

it("신규 조회가 모두 실패해도 저장 기록이 있으면 부분 성공이다", async () => {
  // Arrange
  const source = sourceFor(
    {
      ...clientFor([]),
      findPlayerMatch: async () =>
        Result.fail(new MatchCollectionError({ reason: "TIMEOUT" })),
    },
    [match("cached")],
  );

  // Act
  const batch = Result.unwrap(
    await source.collectSelection(
      target,
      ["cached", "missing"],
      new AbortController().signal,
    ),
  );

  // Assert
  expect(batch.outcome).toEqual({ status: "PARTIALLY_SUCCEEDED" });
  expect(batch.matches).toEqual([]);
});

it("429는 다음 묶음을 중단하고 확보 기록과 제한 시각을 반환한다", async () => {
  // Arrange
  const calls: string[] = [];
  const signals: AbortSignal[] = [];
  const retryAvailableAt = new Date(20000);
  const source = sourceFor({
    ...clientFor([]),
    findPlayerMatch: async (id, _puuid, signal) => {
      calls.push(id);
      if (signal) signals.push(signal);
      return id === "limited"
        ? Result.fail(
            new MatchCollectionError({
              reason: "HTTP",
              status: 429,
              retryAvailableAt,
            }),
          )
        : Result.succeed(match(id));
    },
  });

  // Act
  const batch = Result.unwrap(
    await source.collectSelection(
      target,
      ["valid", "limited", "never"],
      new AbortController().signal,
    ),
  );

  // Assert
  expect(calls).toEqual(["valid", "limited"]);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  expect(batch.matches.map((record) => record.matchId)).toEqual(["valid"]);
  expect(batch.outcome).toEqual({
    status: "FAILED",
    failure: { code: "RIOT_RATE_LIMITED", retryAvailableAt },
  });
});

it.each([
  {
    error: new MatchCollectionError({ reason: "HTTP", status: 401 }),
    code: "AUTHENTICATION_FAILED",
  },
  {
    error: new MatchCollectionError({ reason: "HTTP", status: 403 }),
    code: "AUTHENTICATION_FAILED",
  },
  {
    error: new MatchCollectionError({ reason: "CONFIGURATION" }),
    code: "CONFIGURATION_ERROR",
  },
  {
    error: new MatchCollectionError({ reason: "INVALID_RESPONSE" }),
    code: "INVALID_RESPONSE",
  },
])("영구 오류 $code 는 수집 복구가 아닌 종료 결과로 반환한다", async ({
  error,
  code,
}) => {
  // Arrange
  const source = sourceFor({
    ...clientFor([]),
    findPlayerMatch: async () => Result.fail(error),
  });

  // Act
  const batch = Result.unwrap(
    await source.collectSelection(
      target,
      ["invalid"],
      new AbortController().signal,
    ),
  );

  // Assert
  expect(batch.outcome).toEqual({
    status: "FAILED",
    failure: { code, retryAvailableAt: null },
  });
});

it.each([
  new MatchCollectionError({ reason: "HTTP", status: 503 }),
  new MatchCollectionError({ reason: "TIMEOUT" }),
  new MatchCollectionError({ reason: "REQUEST_FAILED" }),
])("최초 목록의 일시 오류 %j는 작업 복구 가능한 실패로 원인을 보존한다", async (cause) => {
  // Arrange
  const source = sourceFor({
    ...clientFor([]),
    findRecentMatchIds: async () => Result.fail(cause),
  });

  // Act
  const result = await source.findSelection(
    target,
    new AbortController().signal,
  );

  // Assert
  expect(Result.unwrapError(result)).toMatchObject({
    cause,
    failure: { code: "TEMPORARY_FAILURE", retryAvailableAt: null },
  });
});

it("분류하지 못한 캐시 조회 장애는 추측해 재시도하지 않고 원인을 보존한다", async () => {
  // Arrange
  const cause = new MatchRepositoryError({
    cause: new Error("unknown DB error"),
  });
  const source = new StoredMatchCollectionSource(
    new MatchCollectionFetcher(
      { findByMatchIds: async () => Result.fail(cause) },
      clientFor([]),
    ),
  );

  // Act
  const result = await source.collectSelection(
    target,
    ["KR_1"],
    new AbortController().signal,
  );

  // Assert
  expect(result).toEqual(Result.fail(expect.any(MatchCollectionAttemptError)));
  expect(Result.unwrapError(result)).toMatchObject({
    cause,
    failure: { code: "COLLECTION_FAILED", retryAvailableAt: null },
  });
});

it.each([
  "wrong-id",
  "wrong-player",
  "wrong-queue",
])("상세의 %s 불일치는 잘못된 응답으로 종료한다", async (kind) => {
  // Arrange
  const wrong = new PlayerMatch(
    createPlayerMatchData({
      matchId: kind === "wrong-id" ? "other" : "KR_1",
      puuid: kind === "wrong-player" ? "other" : "player",
      queueId: kind === "wrong-queue" ? 440 : 420,
    }),
  );
  const source = sourceFor({
    ...clientFor([]),
    findPlayerMatch: async () => Result.succeed(wrong),
  });

  // Act
  const batch = Result.unwrap(
    await source.collectSelection(
      target,
      ["KR_1"],
      new AbortController().signal,
    ),
  );

  // Assert
  expect(batch.matches).toEqual([]);
  expect(batch.outcome).toEqual({
    status: "FAILED",
    failure: { code: "INVALID_RESPONSE", retryAvailableAt: null },
  });
});

it("취소된 요청은 목록·캐시·상세 조회를 시작하지 않는다", async () => {
  // Arrange
  const controller = new AbortController();
  controller.abort();
  const source = new StoredMatchCollectionSource(
    new MatchCollectionFetcher(
      {
        findByMatchIds: async () => {
          throw new Error("DB 조회 금지");
        },
      },
      {
        findRecentMatchIds: async () => {
          throw new Error("목록 조회 금지");
        },
        findPlayerMatch: async () => {
          throw new Error("상세 조회 금지");
        },
      },
    ),
  );

  // Act
  const listed = await source.findSelection(target, controller.signal);
  const collected = await source.collectSelection(
    target,
    ["KR_1"],
    controller.signal,
  );

  // Assert
  expect(Result.isFailure(listed)).toBe(true);
  expect(Result.isFailure(collected)).toBe(true);
});

it("외부 취소 신호를 진행 중 요청에 전달하고 다음 묶음을 시작하지 않는다", async () => {
  // Arrange
  const controller = new AbortController();
  const calls: string[] = [];
  const observed: AbortSignal[] = [];
  const source = sourceFor({
    ...clientFor([]),
    findPlayerMatch: async (id, _puuid, signal) => {
      calls.push(id);
      if (signal) observed.push(signal);
      controller.abort();
      return Result.fail(
        new MatchCollectionError({ reason: "REQUEST_FAILED" }),
      );
    },
  });

  // Act
  await source.collectSelection(
    target,
    ["first", "second", "never"],
    controller.signal,
  );

  // Assert
  expect(calls).not.toContain("never");
  expect(observed.every((signal) => signal.aborted)).toBe(true);
});

const target = { puuid: "player", queueId: 420 } as const;

/** @description 정상 경기 객체를 생성하며 저장소나 네트워크를 사용하지 않는다. */
function match(matchId: string) {
  return new PlayerMatch(createPlayerMatchData({ matchId }));
}

/** @description 외부 경계는 대역으로 두되 실제 공용 수집 실행부와 Source를 검증한다. */
function sourceFor(
  client: RiotMatchClient,
  cached: readonly PlayerMatch[] = [],
) {
  return new StoredMatchCollectionSource(
    new MatchCollectionFetcher(
      { findByMatchIds: async () => Result.succeed(cached) },
      client,
    ),
  );
}

/** @description 요청한 ID의 정상 경기만 반환하는 외부 API 대역이다. */
function clientFor(ids: readonly string[]): RiotMatchClient {
  return {
    findRecentMatchIds: async () => Result.succeed(ids),
    findPlayerMatch: async (id) => Result.succeed(match(id)),
  };
}
