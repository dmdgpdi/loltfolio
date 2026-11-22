import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { MatchCollectionJob } from "./MatchCollectionJob";
import type { MatchCollectionJobData } from "./types/MatchCollectionJobData.type";

it("저장된 재시도 대기를 복원해 같은 작업과 최초 경기 목록으로 재개한다", () => {
  const job = createJob();
  Result.unwrap(job.start(new Date(1000)));
  Result.unwrap(job.selectMatches(["KR_2", "KR_1"]));
  Result.unwrap(
    job.scheduleRetry(
      { code: "WORKER_INTERRUPTED", retryAvailableAt: null },
      new Date(3000),
      new Date(2000),
    ),
  );
  const restored = Result.unwrap(MatchCollectionJob.restore(job.snapshot));
  Result.unwrap(restored.start(new Date(3000)));
  expect(restored.snapshot).toMatchObject({
    jobId: "job-1",
    status: "RUNNING",
    attemptCount: 2,
    startedAt: new Date(1000),
    updatedAt: new Date(3000),
    selectedMatchIds: ["KR_2", "KR_1"],
  });
});

it.each([
  "QUEUED",
  "RUNNING",
  "RETRY_WAIT",
  "FINALIZING",
  "SUCCEEDED",
  "PARTIALLY_SUCCEEDED",
  "FAILED",
] as const)("%s 상태를 정보 손실 없이 복원한다", (status) => {
  const job = createJob();
  if (status !== "QUEUED") Result.unwrap(job.start(new Date(1000)));
  if (status === "RETRY_WAIT")
    Result.unwrap(
      job.scheduleRetry(
        { code: "TEMPORARY_FAILURE", retryAvailableAt: null },
        new Date(3000),
        new Date(2000),
      ),
    );
  if (
    ["FINALIZING", "SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED"].includes(
      status,
    )
  ) {
    Result.unwrap(job.selectMatches(["KR_1"]));
    Result.unwrap(
      job.recordOutcome(
        status === "FAILED"
          ? {
              status,
              failure: {
                code: "RIOT_RATE_LIMITED",
                retryAvailableAt: new Date(5000),
              },
            }
          : { status: status === "PARTIALLY_SUCCEEDED" ? status : "SUCCEEDED" },
        new Date(2000),
      ),
    );
    if (status !== "FINALIZING") Result.unwrap(job.finish(new Date(3000)));
  }
  const restored = Result.unwrap(MatchCollectionJob.restore(job.snapshot));
  expect(restored.snapshot).toEqual(job.snapshot);
  if (status === "FINALIZING") {
    Result.unwrap(restored.finish(new Date(3000)));
    expect(restored.snapshot.status).toBe("SUCCEEDED");
  }
});

it("복원 후에도 마지막 전이보다 이른 시각을 거부하고 외부 Date 변경으로부터 보호한다", () => {
  const job = createJob();
  Result.unwrap(job.start(new Date(1000)));
  const snapshot = job.snapshot;
  const restored = Result.unwrap(MatchCollectionJob.restore(snapshot));
  snapshot.updatedAt.setTime(0);
  expect(
    Result.isFailure(
      restored.recordOutcome(
        {
          status: "FAILED",
          failure: { code: "COLLECTION_FAILED", retryAvailableAt: null },
        },
        new Date(999),
      ),
    ),
  ).toBe(true);
  expect(restored.snapshot.updatedAt).toEqual(new Date(1000));
});

it.each<Partial<MatchCollectionJobData>>([
  { status: "RUNNING" },
  { updatedAt: new Date(-1) },
  { attemptCount: 1 },
  { selectedMatchIds: ["KR_1", "KR_1"] },
  { outcome: { status: "SUCCEEDED" } },
  { nextAttemptAt: new Date(1000) },
  { finishedAt: new Date(1000) },
  { maxAttempts: 0 },
  { updatedAt: new Date(Number.NaN) },
])("모순되거나 손상된 대기 기록을 복원하지 않는다: %j", (change) => {
  expect(
    Result.isFailure(
      MatchCollectionJob.restore({ ...createJob().snapshot, ...change }),
    ),
  ).toBe(true);
});

/** @description 복원 예시에 사용할 최초 접수 기록을 만든다. */
function createJob() {
  return Result.unwrap(
    MatchCollectionJob.create({
      jobId: "job-1",
      puuid: "player",
      queueId: 420,
      requestedAt: new Date(0),
      maxAttempts: 2,
    }),
  );
}
