import { Result } from "@praha/byethrow";
import { expect, it, vi } from "vitest";
import { MatchCollectionJob } from "@/backend/match/domain/MatchCollectionJob";
import { InvalidMatchCollectionCommandError } from "./errors/InvalidMatchCollectionCommandError";
import { MatchCollectionJobPersistenceError } from "./errors/MatchCollectionJobPersistenceError";
import { ProjectedMatchCollectionJobReader } from "./ProjectedMatchCollectionJobReader";

it("대기 작업의 대상·공개 상태·ISO 시각을 반환한다", async () => {
  // Arrange
  const job = newJob();
  const reader = new ProjectedMatchCollectionJobReader({
    findById: async () =>
      Result.succeed({ job: job.snapshot, retryAvailableAt: null }),
  });

  // Act
  const result = await reader.findById("job-1");

  // Assert
  expect(result).toEqual(
    Result.succeed({
      jobId: "job-1",
      target: { puuid: "player", queueId: 420 },
      status: "QUEUED",
      requestedAt: "1970-01-01T00:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      failure: null,
      retryAvailableAt: null,
    }),
  );
});

it.each([
  "RUNNING",
  "RETRY_WAIT",
  "FINALIZING",
] as const)("내부 %s 상태는 수집 중으로 보여주며 조회가 상태를 바꾸지 않는다", async (status) => {
  // Arrange
  const job = newJob();
  Result.unwrap(job.start(new Date(1000)));
  if (status === "RETRY_WAIT")
    Result.unwrap(
      job.scheduleRetry(
        { code: "TEMPORARY_FAILURE", retryAvailableAt: null },
        new Date(5000),
        new Date(2000),
      ),
    );
  if (status === "FINALIZING")
    Result.unwrap(
      job.recordOutcome(
        {
          status: "FAILED",
          failure: {
            code: "RIOT_RATE_LIMITED",
            retryAvailableAt: new Date(10000),
          },
        },
        new Date(2000),
      ),
    );
  const before = job.snapshot;
  const reader = new ProjectedMatchCollectionJobReader({
    findById: async () =>
      Result.succeed({ job: job.snapshot, retryAvailableAt: null }),
  });

  // Act
  const dto = Result.unwrap(await reader.findById("job-1"));

  // Assert
  expect(dto?.status).toBe("RUNNING");
  expect(dto?.failure).toBeNull();
  expect(job.snapshot).toEqual(before);
  expect(dto).not.toHaveProperty("attemptCount");
  expect(dto).not.toHaveProperty("outcome");
  expect(dto).not.toHaveProperty("lastFailure");
});

it.each([
  "SUCCEEDED",
  "PARTIALLY_SUCCEEDED",
] as const)("종료한 %s 상태는 그대로 공개한다", async (status) => {
  // Arrange
  const job = newJob();
  Result.unwrap(job.start(new Date(1000)));
  Result.unwrap(job.selectMatches(["KR_1"]));
  Result.unwrap(job.recordOutcome({ status }, new Date(2000)));
  Result.unwrap(job.finish(new Date(3000)));
  const reader = new ProjectedMatchCollectionJobReader({
    findById: async () =>
      Result.succeed({
        job: job.snapshot,
        retryAvailableAt: new Date(1203000),
      }),
  });

  // Act
  const dto = Result.unwrap(await reader.findById("job-1"));

  // Assert
  expect(dto).toMatchObject({
    status,
    finishedAt: "1970-01-01T00:00:03.000Z",
    retryAvailableAt: "1970-01-01T00:20:03.000Z",
    failure: null,
  });
  expect(JSON.parse(JSON.stringify(dto))).toEqual(dto);
});

it("실패 코드와 공개 안내만 반환하고 현재 대상의 재시도 가능 시각을 사용한다", async () => {
  // Arrange
  const job = newJob();
  Result.unwrap(job.start(new Date(1000)));
  Result.unwrap(
    job.recordOutcome(
      {
        status: "FAILED",
        failure: {
          code: "RIOT_RATE_LIMITED",
          retryAvailableAt: new Date(10000),
        },
      },
      new Date(2000),
    ),
  );
  Result.unwrap(job.finish(new Date(3000)));
  const reader = new ProjectedMatchCollectionJobReader({
    findById: async () =>
      Result.succeed({ job: job.snapshot, retryAvailableAt: new Date(20000) }),
  });

  // Act
  const dto = Result.unwrap(await reader.findById("job-1"));

  // Assert
  expect(dto?.status).toBe("FAILED");
  expect(dto?.failure).toEqual({
    code: "RIOT_RATE_LIMITED",
    message: "Riot API 호출 제한으로 수집을 중단했습니다.",
  });
  expect(dto?.retryAvailableAt).toBe("1970-01-01T00:00:20.000Z");
  expect(Object.isFrozen(dto)).toBe(true);
  expect(Object.isFrozen(dto?.target)).toBe(true);
  expect(Object.isFrozen(dto?.failure)).toBe(true);
});

it("없는 작업은 조회 실패가 아닌 null이다", async () => {
  // Arrange
  const reader = new ProjectedMatchCollectionJobReader({
    findById: async () => Result.succeed(null),
  });

  // Act / Assert
  expect(await reader.findById("missing")).toEqual(Result.succeed(null));
});

it("저장소 오류는 원인과 함께 전달한다", async () => {
  // Arrange
  const error = new MatchCollectionJobPersistenceError({
    retryable: true,
    cause: new Error("secret SQL"),
  });
  const reader = new ProjectedMatchCollectionJobReader({
    findById: async () => Result.fail(error),
  });

  // Act / Assert
  expect(await reader.findById("job-1")).toEqual(Result.fail(error));
});

it.each([
  "",
  " ",
  " job-1",
])("잘못된 작업 ID %j는 조회하지 않는다", async (jobId) => {
  // Arrange
  const findById = vi.fn();

  // Act
  const result = await new ProjectedMatchCollectionJobReader({
    findById,
  }).findById(jobId);

  // Assert
  expect(result).toEqual(
    Result.fail(expect.any(InvalidMatchCollectionCommandError)),
  );
  expect(findById).not.toHaveBeenCalled();
});

/** @description 각 조회 spec에서 독립적으로 변경할 실제 작업을 만든다. */
function newJob() {
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
