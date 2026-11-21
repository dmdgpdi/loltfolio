import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { MemoryMatchCollectionJobs } from "@/backend/match/testing/MemoryMatchCollectionJobs";
import { MatchCollectionJobPersistenceError } from "./errors/MatchCollectionJobPersistenceError";
import { MatchCollectionLeaseLostError } from "./errors/MatchCollectionLeaseLostError";
import { FinalizeMatchCollection } from "./FinalizeMatchCollection";
import type { MatchCollectionCompletion } from "./MatchCollectionCompletion";

it("기록한 성공 결과로 작업과 MatchSync의 완료 표본을 확정한다", async () => {
  // Arrange
  const { store, assignment } = await setup();
  Result.unwrap(await store.saveSelection(assignment.lease, ["KR_1"]));
  const recorded = Result.unwrap(
    await store.recordOutcome(assignment.lease, { status: "SUCCEEDED" }),
  );
  const service = new FinalizeMatchCollection(store);

  // Act
  const result = await service.execute(recorded, new AbortController().signal);

  // Assert
  expect(result).toEqual(Result.succeed(undefined));
  expect(store.jobs.get("job-1")?.snapshot.status).toBe("SUCCEEDED");
  expect(store.syncs.values().next().value?.lastCompletedMatchIds).toEqual([
    "KR_1",
  ]);
});

it("429 실패를 확정하고 새 Command의 재요청을 제한한다", async () => {
  // Arrange
  const { store, assignment } = await setup();
  const recorded = Result.unwrap(
    await store.recordOutcome(assignment.lease, {
      status: "FAILED",
      failure: { code: "RIOT_RATE_LIMITED", retryAvailableAt: new Date(20000) },
    }),
  );

  // Act
  await new FinalizeMatchCollection(store).execute(
    recorded,
    new AbortController().signal,
  );
  const admission = await store.admit({ puuid: "player", queueId: 420 }, 2);

  // Assert
  expect(store.jobs.get("job-1")?.snapshot.status).toBe("FAILED");
  expect(Result.unwrapError(admission)).toMatchObject({
    code: "RIOT_RETRY_RESTRICTED",
    retryAvailableAt: new Date(20000),
  });
});

it("종료 저장 장애는 결과를 유지하고 같은 종료 처리로 재시도한다", async () => {
  // Arrange
  const { store, assignment } = await setup();
  const recorded = Result.unwrap(
    await store.recordOutcome(assignment.lease, {
      status: "FAILED",
      failure: { code: "COLLECTION_FAILED", retryAvailableAt: null },
    }),
  );
  const service = new FinalizeMatchCollection(store);
  const error = new MatchCollectionJobPersistenceError({ retryable: true });
  store.finishError = error;

  // Act
  const failed = await service.execute(recorded, new AbortController().signal);
  const during = store.jobs.get("job-1")?.snapshot;
  store.finishError = null;
  const retried = await service.execute(recorded, new AbortController().signal);

  // Assert
  expect(failed).toEqual(Result.fail(error));
  expect(during?.status).toBe("FINALIZING");
  expect(retried).toEqual(Result.succeed(undefined));
  expect(store.jobs.get("job-1")?.snapshot.attemptCount).toBe(1);
});

it("완료 커밋 응답만 유실돼도 수집하지 않고 종료 여부를 확인한다", async () => {
  // Arrange
  const { store, assignment } = await setup();
  const recorded = Result.unwrap(
    await store.recordOutcome(assignment.lease, {
      status: "FAILED",
      failure: { code: "COLLECTION_FAILED", retryAvailableAt: null },
    }),
  );
  store.finishCommitError = new MatchCollectionJobPersistenceError({
    retryable: true,
  });
  const service = new FinalizeMatchCollection(store);
  await service.execute(recorded, new AbortController().signal);
  store.finishCommitError = null;

  // Act
  const result = await service.execute(recorded, new AbortController().signal);

  // Assert
  expect(result).toEqual(Result.succeed(undefined));
  expect(store.jobs.get("job-1")?.snapshot.status).toBe("FAILED");
});

it("실행 권한이 만료되면 새 워커가 종료만 이어받는다", async () => {
  // Arrange
  const { store, assignment } = await setup();
  const recorded = Result.unwrap(
    await store.recordOutcome(assignment.lease, {
      status: "FAILED",
      failure: { code: "RIOT_RATE_LIMITED", retryAvailableAt: new Date(30000) },
    }),
  );
  store.now = new Date(12000);
  const recovered = Result.unwrap(await store.claimNext());
  if (!recovered) throw new Error("종료 확정 작업이 필요합니다.");

  // Act
  const stale = await new FinalizeMatchCollection(store).execute(
    recorded,
    new AbortController().signal,
  );
  const result = await new FinalizeMatchCollection(store).execute(
    recovered,
    new AbortController().signal,
  );

  // Assert
  expect(stale).toEqual(Result.fail(expect.any(MatchCollectionLeaseLostError)));
  expect(result).toEqual(Result.succeed(undefined));
  expect(store.jobs.get("job-1")?.snapshot.attemptCount).toBe(1);
});

it("수집 권한으로 종료 확정을 요청하지 않는다", async () => {
  // Arrange
  const { assignment } = await setup();
  const completion: MatchCollectionCompletion = {
    recordOutcome: async () => {
      throw new Error("호출 금지");
    },
    finish: async () => {
      throw new Error("호출 금지");
    },
  };

  // Act
  const result = await new FinalizeMatchCollection(completion).execute(
    assignment,
    new AbortController().signal,
  );

  // Assert
  expect(result).toEqual(
    Result.fail(expect.any(MatchCollectionLeaseLostError)),
  );
});

/** @description 실제 도메인 상태를 가진 실행 작업을 각 테스트마다 새로 준비한다. */
async function setup() {
  const store = new MemoryMatchCollectionJobs();
  Result.unwrap(await store.admit({ puuid: "player", queueId: 420 }, 2));
  store.now = new Date(1000);
  const assignment = Result.unwrap(await store.claimNext());
  if (!assignment) throw new Error("작업이 필요합니다.");
  return { store, assignment };
}
