import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { PlayerMatch } from "@/backend/match/domain/PlayerMatch";
import { createPlayerMatchData } from "@/backend/match/testing/createPlayerMatchData";
import { MemoryMatchCollectionJobs } from "@/backend/match/testing/MemoryMatchCollectionJobs";
import { FinalizeMatchCollection } from "./FinalizeMatchCollection";
import type { MatchCollectionSource } from "./MatchCollectionSource";
import { ProjectedMatchCollectionJobReader } from "./ProjectedMatchCollectionJobReader";
import { RequestMatchCollection } from "./RequestMatchCollection";
import { RunMatchCollection } from "./RunMatchCollection";

it("접수·수집·상태 조회·종료 확정을 연결하고 표본은 완료 이후 공개한다", async () => {
  // Arrange
  const store = new MemoryMatchCollectionJobs();
  const command = new RequestMatchCollection(store, 2);
  const reader = new ProjectedMatchCollectionJobReader(store);
  const source: MatchCollectionSource = {
    findSelection: async () => Result.succeed(["KR_1"]),
    collectSelection: async () =>
      Result.succeed({
        matches: [new PlayerMatch(createPlayerMatchData())],
        outcome: { status: "SUCCEEDED" },
      }),
  };

  // Act
  const admitted = Result.unwrap(
    await command.execute({ puuid: "player", queueId: 420 }),
  );
  const queued = Result.unwrap(await reader.findById(admitted.jobId));
  store.now = new Date(1000);
  const claimed = Result.unwrap(await store.claimNext());
  if (!claimed) throw new Error("실행 작업이 필요합니다.");
  const recorded = Result.unwrap(
    await new RunMatchCollection(store, store, store, source).execute(
      claimed,
      new AbortController().signal,
    ),
  );
  if (!recorded) throw new Error("종료 확정 작업이 필요합니다.");
  const during = Result.unwrap(await reader.findById(admitted.jobId));
  const oldSelection = store.syncs.values().next().value?.lastCompletedMatchIds;
  Result.unwrap(
    await new FinalizeMatchCollection(store).execute(
      recorded,
      new AbortController().signal,
    ),
  );
  const completed = Result.unwrap(await reader.findById(admitted.jobId));

  // Assert
  expect(queued?.status).toBe("QUEUED");
  expect(during?.status).toBe("RUNNING");
  expect(oldSelection).toBeNull();
  expect(completed).toMatchObject({ status: "SUCCEEDED", failure: null });
  expect(store.syncs.values().next().value?.lastCompletedMatchIds).toEqual([
    "KR_1",
  ]);
});

it.each([
  "RETRY_WAIT",
  "FINALIZING",
] as const)("%s 작업도 새 요청에 공유하고 설정 변경으로 기존 시도 한도를 바꾸지 않는다", async (state) => {
  // Arrange
  const store = new MemoryMatchCollectionJobs();
  const target = { puuid: "player", queueId: 420 } as const;
  Result.unwrap(await new RequestMatchCollection(store, 2).execute(target));
  store.now = new Date(1000);
  const claimed = Result.unwrap(await store.claimNext());
  if (!claimed) throw new Error("작업이 필요합니다.");
  if (state === "RETRY_WAIT") {
    Result.unwrap(
      await store.scheduleRetry(claimed.lease, {
        code: "TEMPORARY_FAILURE",
        retryAvailableAt: null,
      }),
    );
  } else {
    Result.unwrap(
      await store.recordOutcome(claimed.lease, {
        status: "FAILED",
        failure: {
          code: "RIOT_RATE_LIMITED",
          retryAvailableAt: new Date(20000),
        },
      }),
    );
  }

  // Act
  const result = await new RequestMatchCollection(store, 5).execute(target);

  // Assert
  expect(result).toEqual(Result.succeed({ jobId: "job-1", created: false }));
  expect(store.jobs.get("job-1")?.snapshot).toMatchObject({
    status: state,
    maxAttempts: 2,
  });
  expect(store.jobs.size).toBe(1);
});

it("자동 복구를 소진한 작업 종료 후 사용자 Command는 새 작업으로 접수한다", async () => {
  // Arrange
  const store = new MemoryMatchCollectionJobs();
  const target = { puuid: "player", queueId: 420 } as const;
  Result.unwrap(await new RequestMatchCollection(store, 1).execute(target));
  store.now = new Date(1000);
  const claimed = Result.unwrap(await store.claimNext());
  if (!claimed) throw new Error("작업이 필요합니다.");
  const exhausted = Result.unwrap(
    await store.scheduleRetry(claimed.lease, {
      code: "WORKER_INTERRUPTED",
      retryAvailableAt: null,
    }),
  );
  if (!exhausted) throw new Error("한도 소진 작업이 필요합니다.");
  Result.unwrap(
    await new FinalizeMatchCollection(store).execute(
      exhausted,
      new AbortController().signal,
    ),
  );

  // Act
  const result = await new RequestMatchCollection(store, 3).execute(target);

  // Assert
  expect(result).toEqual(Result.succeed({ jobId: "job-2", created: true }));
  expect(store.jobs.get("job-1")?.snapshot).toMatchObject({
    status: "FAILED",
    attemptCount: 1,
  });
  expect(store.jobs.get("job-2")?.snapshot).toMatchObject({
    status: "QUEUED",
    attemptCount: 0,
    maxAttempts: 3,
    selectedMatchIds: null,
  });
});

it("성공 후 20분 경계 전은 거부하고 같은 순간부터 새 작업을 받는다", async () => {
  // Arrange
  const store = new MemoryMatchCollectionJobs();
  const target = { puuid: "player", queueId: 420 } as const;
  const command = new RequestMatchCollection(store, 2);
  Result.unwrap(await command.execute(target));
  store.now = new Date(1000);
  const claimed = Result.unwrap(await store.claimNext());
  if (!claimed) throw new Error("작업이 필요합니다.");
  Result.unwrap(await store.saveSelection(claimed.lease, []));
  const recorded = Result.unwrap(
    await store.recordOutcome(claimed.lease, { status: "SUCCEEDED" }),
  );
  Result.unwrap(
    await new FinalizeMatchCollection(store).execute(
      recorded,
      new AbortController().signal,
    ),
  );

  // Act
  store.now = new Date(1200999);
  const before = await command.execute(target);
  store.now = new Date(1201000);
  const boundary = await command.execute(target);

  // Assert
  expect(Result.unwrapError(before)).toMatchObject({
    code: "COLLECTION_COOLDOWN",
    retryAvailableAt: new Date(1201000),
  });
  expect(boundary).toEqual(Result.succeed({ jobId: "job-2", created: true }));
});
