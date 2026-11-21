import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { PlayerMatch } from "@/backend/match/domain/PlayerMatch";
import { RiotMatchAdapter } from "@/backend/match/infrastructure/riot/RiotMatchAdapter";
import { createPlayerMatchData } from "@/backend/match/testing/createPlayerMatchData";
import { createRiotMatchResponse } from "@/backend/match/testing/createRiotMatchResponse";
import { createRiotTimelineResponse } from "@/backend/match/testing/createRiotTimelineResponse";
import { MemoryMatchCollectionJobs } from "@/backend/match/testing/MemoryMatchCollectionJobs";
import { FinalizeMatchCollection } from "./FinalizeMatchCollection";
import { MatchCollectionFetcher } from "./MatchCollectionFetcher";
import { RequestMatchCollection } from "./RequestMatchCollection";
import { RunMatchCollection } from "./RunMatchCollection";
import { StoredMatchCollectionSource } from "./StoredMatchCollectionSource";

it("실제 Riot 변환·수집 실행·결과 확정을 연결하고 기존 경기는 재사용한다", async () => {
  // Arrange
  const store = new MemoryMatchCollectionJobs();
  const cached = new PlayerMatch(
    createPlayerMatchData({ puuid: "target", matchId: "cached" }),
  );
  store.savedMatches.push(cached);
  const requested: string[] = [];
  const source = sourceFor(store, async (input) => {
    const path = new URL((input as Request).url).pathname;
    requested.push(path);
    return responseFor(path, ["KR_1", "cached"]);
  });
  const command = new RequestMatchCollection(store, 2);
  const target = { puuid: "target", queueId: 420 } as const;
  Result.unwrap(await command.execute(target));
  store.now = new Date(1000);
  const claimed = Result.unwrap(await store.claimNext());
  if (!claimed) throw new Error("선점 작업이 필요합니다.");

  // Act
  const recorded = Result.unwrap(
    await new RunMatchCollection(store, store, store, source).execute(
      claimed,
      new AbortController().signal,
    ),
  );
  if (!recorded) throw new Error("종료 확정 작업이 필요합니다.");
  Result.unwrap(
    await new FinalizeMatchCollection(store).execute(
      recorded,
      new AbortController().signal,
    ),
  );

  // Assert
  expect(store.jobs.get("job-1")?.snapshot.status).toBe("SUCCEEDED");
  expect(store.syncs.values().next().value?.lastCompletedMatchIds).toEqual([
    "KR_1",
    "cached",
  ]);
  expect(
    store.savedMatches.find((match) => match.matchId === "KR_1")?.stats.combat
      .kills,
  ).toEqual({ status: "AVAILABLE", value: 3 });
  expect(store.savedMatches).toContain(cached);
  expect(requested).toEqual([
    "/lol/match/v5/matches/by-puuid/target/ids",
    "/lol/match/v5/matches/KR_1",
    "/lol/match/v5/matches/KR_1/timeline",
  ]);
});

it("일부 HTTP 실패는 원래 목록을 유지한 부분 성공으로 확정한다", async () => {
  // Arrange
  const store = new MemoryMatchCollectionJobs();
  const source = sourceFor(store, async (input) => {
    const path = new URL((input as Request).url).pathname;
    if (path.endsWith("ids")) return Response.json(["KR_1", "missing"]);
    if (path.endsWith("missing")) return new Response(null, { status: 503 });
    return Response.json(
      path.endsWith("timeline")
        ? createRiotTimelineResponse()
        : createRiotMatchResponse(),
    );
  });
  Result.unwrap(await store.admit({ puuid: "target", queueId: 420 }, 2));
  store.now = new Date(1000);
  const claimed = Result.unwrap(await store.claimNext());
  if (!claimed) throw new Error("선점 작업이 필요합니다.");

  // Act
  const recorded = Result.unwrap(
    await new RunMatchCollection(store, store, store, source).execute(
      claimed,
      new AbortController().signal,
    ),
  );
  if (!recorded) throw new Error("종료 확정 작업이 필요합니다.");
  Result.unwrap(
    await new FinalizeMatchCollection(store).execute(
      recorded,
      new AbortController().signal,
    ),
  );

  // Assert
  expect(store.jobs.get("job-1")?.snapshot.status).toBe("PARTIALLY_SUCCEEDED");
  expect(store.savedMatches.map((match) => match.matchId)).toEqual(["KR_1"]);
  expect(store.syncs.values().next().value?.lastCompletedMatchIds).toEqual([
    "KR_1",
    "missing",
  ]);
});

it("실제 어댑터의 429와 Retry-After를 실패 결과와 MatchSync에 보존한다", async () => {
  // Arrange
  const store = new MemoryMatchCollectionJobs();
  let requests = 0;
  const source = sourceFor(store, async () => {
    requests++;
    return new Response(null, {
      status: 429,
      headers: { "Retry-After": "120" },
    });
  });
  Result.unwrap(await store.admit({ puuid: "target", queueId: 420 }, 2));
  store.now = new Date(1000);
  const claimed = Result.unwrap(await store.claimNext());
  if (!claimed) throw new Error("선점 작업이 필요합니다.");
  const before = Date.now();

  // Act
  const recorded = Result.unwrap(
    await new RunMatchCollection(store, store, store, source).execute(
      claimed,
      new AbortController().signal,
    ),
  );
  if (!recorded) throw new Error("종료 확정 작업이 필요합니다.");
  Result.unwrap(
    await new FinalizeMatchCollection(store).execute(
      recorded,
      new AbortController().signal,
    ),
  );

  // Assert
  expect(requests).toBe(1);
  expect(store.jobs.get("job-1")?.snapshot).toMatchObject({
    status: "FAILED",
    outcome: { status: "FAILED", failure: { code: "RIOT_RATE_LIMITED" } },
  });
  expect(
    store.syncs.values().next().value?.retryAvailableAt?.getTime(),
  ).toBeGreaterThanOrEqual(before + 120000);
  expect(store.syncs.values().next().value?.lastCompletedMatchIds).toBeNull();
});

/** @description HTTP와 저장소 경계만 대체하고 실제 수집·Riot 변환 코드를 조립한다. DB 원자성 검증은 포함하지 않는다. */
function sourceFor(store: MemoryMatchCollectionJobs, request: typeof fetch) {
  const adapter = new RiotMatchAdapter({
    apiKey: "test-key",
    region: "ASIA",
    fetch: request,
  });
  const fetcher = new MatchCollectionFetcher(
    { findByMatchIds: async () => Result.succeed([...store.savedMatches]) },
    adapter,
  );
  return new StoredMatchCollectionSource(fetcher);
}

/** @description 목록 이외의 정상 HTTP 응답 fixture를 공유하되 수집 대상 ID는 테스트 본문에서 지정한다. */
function responseFor(path: string, ids: readonly string[]): Response {
  return Response.json(
    path.endsWith("ids")
      ? ids
      : path.endsWith("timeline")
        ? createRiotTimelineResponse()
        : createRiotMatchResponse(),
  );
}
