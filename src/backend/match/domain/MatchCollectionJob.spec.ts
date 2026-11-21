import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { InvalidMatchCollectionJobError } from "./errors/InvalidMatchCollectionJobError";
import { MatchCollectionJobTransitionError } from "./errors/MatchCollectionJobTransitionError";
import { MatchCollectionJob } from "./MatchCollectionJob";
import type { MatchCollectionJobData } from "./types/MatchCollectionJobData.type";
import type { MatchCollectionJobFailure } from "./types/MatchCollectionJobFailure.type";
import type { MatchCollectionJobOutcome } from "./types/MatchCollectionJobOutcome.type";

it("작업을 접수하고 경기 목록을 수집한 뒤 성공 결과를 확정한다", () => {
  // Arrange
  const job = Result.unwrap(
    MatchCollectionJob.create({
      jobId: "job-1",
      puuid: "player",
      queueId: 420,
      requestedAt: new Date(0),
      maxAttempts: 2,
    }),
  );

  // Act
  Result.unwrap(job.start(new Date(1000)));
  Result.unwrap(job.selectMatches(["KR_2", "KR_1"]));
  Result.unwrap(job.recordOutcome({ status: "SUCCEEDED" }, new Date(2000)));
  Result.unwrap(job.finish(new Date(3000)));

  // Assert
  expect(job.snapshot).toEqual({
    jobId: "job-1",
    puuid: "player",
    queueId: 420,
    maxAttempts: 2,
    status: "SUCCEEDED",
    requestedAt: new Date(0),
    startedAt: new Date(1000),
    finishedAt: new Date(3000),
    selectedMatchIds: ["KR_2", "KR_1"],
    attemptCount: 1,
    nextAttemptAt: null,
    lastFailure: null,
    outcome: { status: "SUCCEEDED" },
  });
});

it("접수 직후에는 대기 상태이며 경기 목록·실행 시각·결과가 없다", () => {
  // Arrange / Act
  const job = newJob();

  // Assert
  expect(job.snapshot).toMatchObject({
    status: "QUEUED",
    attemptCount: 0,
    startedAt: null,
    finishedAt: null,
    selectedMatchIds: null,
    nextAttemptAt: null,
    lastFailure: null,
    outcome: null,
  });
});

it("부분 성공도 결과 기록과 최종 종료를 구분한다", () => {
  // Arrange
  const job = runningJob();
  Result.unwrap(job.selectMatches(["KR_1", "missing"]));

  // Act
  Result.unwrap(job.recordOutcome({ status: "PARTIALLY_SUCCEEDED" }, at(2)));
  const recorded = job.snapshot;
  Result.unwrap(job.finish(at(3)));

  // Assert
  expect(recorded.status).toBe("FINALIZING");
  expect(recorded.finishedAt).toBeNull();
  expect(job.snapshot).toMatchObject({
    status: "PARTIALLY_SUCCEEDED",
    selectedMatchIds: ["KR_1", "missing"],
    outcome: { status: "PARTIALLY_SUCCEEDED" },
    attemptCount: 1,
  });
});

it("목록 조회 전에 실패해도 사유와 재시도 가능 시각을 보존하여 종료한다", () => {
  // Arrange
  const job = runningJob();
  const failure: MatchCollectionJobFailure = {
    code: "RIOT_RATE_LIMITED",
    retryAvailableAt: at(10),
  };

  // Act
  Result.unwrap(job.recordOutcome({ status: "FAILED", failure }, at(2)));
  Result.unwrap(job.finish(at(3)));

  // Assert
  expect(job.snapshot).toMatchObject({
    status: "FAILED",
    selectedMatchIds: null,
    outcome: { status: "FAILED", failure },
    lastFailure: failure,
  });
});

it("복구는 최초 목록·시작 시각을 유지하고 수집 시도 수만 증가시킨다", () => {
  // Arrange
  const job = runningJob();
  Result.unwrap(job.selectMatches(["KR_2", "KR_1"]));
  const failure: MatchCollectionJobFailure = {
    code: "WORKER_INTERRUPTED",
    retryAvailableAt: null,
  };

  // Act
  Result.unwrap(job.scheduleRetry(failure, at(5), at(2)));
  const waiting = job.snapshot;
  Result.unwrap(job.start(at(5)));

  // Assert
  expect(waiting).toMatchObject({
    status: "RETRY_WAIT",
    nextAttemptAt: at(5),
    lastFailure: failure,
  });
  expect(job.snapshot).toMatchObject({
    status: "RUNNING",
    attemptCount: 2,
    startedAt: at(1),
    selectedMatchIds: ["KR_2", "KR_1"],
    nextAttemptAt: null,
    lastFailure: failure,
  });
});

it("최초 목록 확정 전 중단은 복구 후 목록을 선택할 수 있다", () => {
  // Arrange
  const job = runningJob();
  Result.unwrap(job.scheduleRetry(temporaryFailure(), at(5), at(2)));

  // Act
  Result.unwrap(job.start(at(5)));
  Result.unwrap(job.selectMatches(["newest"]));

  // Assert
  expect(job.snapshot.selectedMatchIds).toEqual(["newest"]);
  expect(job.snapshot.attemptCount).toBe(2);
});

it("수집 시도 한도를 소진하면 재실행을 예약하지 않고 실패 확정으로 넘긴다", () => {
  // Arrange
  const job = runningJob(1);
  Result.unwrap(job.selectMatches(["KR_1"]));
  const failure = temporaryFailure();

  // Act
  Result.unwrap(job.scheduleRetry(failure, at(5), at(2)));
  const recorded = job.snapshot;
  Result.unwrap(job.finish(at(3)));

  // Assert
  expect(recorded).toMatchObject({
    status: "FINALIZING",
    nextAttemptAt: null,
    attemptCount: 1,
    outcome: {
      status: "FAILED",
      failure: { code: "ATTEMPTS_EXHAUSTED", retryAvailableAt: null },
    },
    lastFailure: failure,
    selectedMatchIds: ["KR_1"],
  });
  expect(job.snapshot.status).toBe("FAILED");
  expect(job.snapshot.attemptCount).toBe(1);
});

it("종료된 작업과 같은 대상의 새 작업은 별도 시도 수와 새 목록으로 시작한다", () => {
  // Arrange
  const oldJob = runningJob(1);
  Result.unwrap(oldJob.scheduleRetry(temporaryFailure(), at(5), at(2)));
  Result.unwrap(oldJob.finish(at(3)));

  // Act
  const next = newJob({ jobId: "job-2", requestedAt: at(10) });
  Result.unwrap(next.start(at(11)));
  Result.unwrap(next.selectMatches(["newest"]));

  // Assert
  expect(next.snapshot).toMatchObject({
    jobId: "job-2",
    attemptCount: 1,
    selectedMatchIds: ["newest"],
  });
  expect(oldJob.snapshot.status).toBe("FAILED");
});

it("정상 빈 목록은 미확정 null과 구분하며 0경기 성공을 허용한다", () => {
  // Arrange
  const job = runningJob();
  const unselected = job.snapshot;

  // Act
  Result.unwrap(job.selectMatches([]));
  Result.unwrap(job.recordOutcome({ status: "SUCCEEDED" }, at(2)));
  Result.unwrap(job.finish(at(3)));

  // Assert
  expect(unselected.selectedMatchIds).toBeNull();
  expect(job.snapshot.selectedMatchIds).toEqual([]);
  expect(job.snapshot.status).toBe("SUCCEEDED");
});

it("20개 경기의 원래 순서를 보존하고 같은 목록의 재확인은 허용한다", () => {
  // Arrange
  const job = runningJob();
  const ids = Array.from({ length: 20 }, (_, index) => `KR_${20 - index}`);

  // Act
  Result.unwrap(job.selectMatches(ids));
  const same = job.selectMatches([...ids]);

  // Assert
  expect(same).toEqual(Result.succeed(undefined));
  expect(job.snapshot.selectedMatchIds).toEqual(ids);
});

it.each([
  -1, 0, 1,
])("복구 예정 시각과 %i ms 차이에서 실행 가능 여부를 판단한다", (offset) => {
  // Arrange
  const job = runningJob();
  Result.unwrap(job.scheduleRetry(temporaryFailure(), at(5), at(2)));
  const before = job.snapshot;

  // Act
  const result = job.start(new Date(5000 + offset));

  // Assert
  if (offset < 0) {
    expect(result).toEqual(
      Result.fail(expect.any(MatchCollectionJobTransitionError)),
    );
    expect(job.snapshot).toEqual(before);
  } else {
    expect(result).toEqual(Result.succeed(undefined));
    expect(job.snapshot.attemptCount).toBe(2);
  }
});

it("입력·반환 목록과 시각을 변경해도 내부 기록은 유지한다", () => {
  // Arrange
  const requestedAt = at(0);
  const startedAt = at(1);
  const ids = ["KR_2", "KR_1"];
  const job = newJob({ requestedAt });
  Result.unwrap(job.start(startedAt));
  Result.unwrap(job.selectMatches(ids));
  const snapshot = job.snapshot;

  // Act
  requestedAt.setTime(90000);
  startedAt.setTime(90000);
  ids.reverse();
  snapshot.requestedAt.setTime(90000);
  snapshot.startedAt?.setTime(90000);
  const changed = Reflect.set(snapshot.selectedMatchIds ?? [], "0", "changed");

  // Assert
  expect(changed).toBe(false);
  expect(Object.isFrozen(snapshot)).toBe(true);
  expect(job.snapshot).toMatchObject({
    requestedAt: at(0),
    startedAt: at(1),
    selectedMatchIds: ["KR_2", "KR_1"],
  });
});

it("실패 결과와 재시도 시각의 입력·반환값을 변경해도 429 기록은 유지한다", () => {
  // Arrange
  const job = runningJob();
  const retryAvailableAt = at(10);
  const failure: MatchCollectionJobFailure = {
    code: "RIOT_RATE_LIMITED",
    retryAvailableAt,
  };
  const outcome: MatchCollectionJobOutcome = { status: "FAILED", failure };
  Result.unwrap(job.recordOutcome(outcome, at(2)));
  const snapshot = job.snapshot;

  // Act
  retryAvailableAt.setTime(0);
  Reflect.set(failure, "code", "TEMPORARY_FAILURE");
  Reflect.set(outcome, "status", "SUCCEEDED");
  if (snapshot.outcome?.status !== "FAILED")
    throw new Error("실패 결과가 필요합니다.");
  snapshot.outcome.failure.retryAvailableAt?.setTime(0);
  snapshot.lastFailure?.retryAvailableAt?.setTime(0);
  const changed = Reflect.set(
    snapshot.outcome.failure,
    "code",
    "TEMPORARY_FAILURE",
  );

  // Assert
  expect(changed).toBe(false);
  expect(Object.isFrozen(snapshot.outcome)).toBe(true);
  expect(job.snapshot.outcome).toEqual({
    status: "FAILED",
    failure: { code: "RIOT_RATE_LIMITED", retryAvailableAt: at(10) },
  });
});

it("복구 예정·종료 시각도 입력과 반환값 변경으로 바뀌지 않는다", () => {
  // Arrange
  const job = runningJob();
  const nextAttemptAt = at(5);
  Result.unwrap(job.scheduleRetry(temporaryFailure(), nextAttemptAt, at(2)));
  const waiting = job.snapshot;

  // Act
  nextAttemptAt.setTime(0);
  waiting.nextAttemptAt?.setTime(0);
  const premature = job.start(at(4));
  Result.unwrap(job.start(at(5)));
  Result.unwrap(job.selectMatches([]));
  Result.unwrap(job.recordOutcome({ status: "SUCCEEDED" }, at(6)));
  const finishedAt = at(7);
  Result.unwrap(job.finish(finishedAt));
  finishedAt.setTime(0);
  job.snapshot.finishedAt?.setTime(0);

  // Assert
  expect(premature).toEqual(
    Result.fail(expect.any(MatchCollectionJobTransitionError)),
  );
  expect(job.snapshot.finishedAt).toEqual(at(7));
});

it.each([
  { jobId: "" },
  { jobId: " job " },
  { puuid: " " },
  { puuid: " player" },
  { maxAttempts: 0 },
  { maxAttempts: -1 },
  { maxAttempts: 1.5 },
  { maxAttempts: Infinity },
  { maxAttempts: Number.MAX_SAFE_INTEGER + 1 },
  { requestedAt: new Date(NaN) },
])("잘못된 생성 입력 %j는 작업을 만들지 않는다", (overrides) => {
  // Arrange
  const input = {
    jobId: "job-1",
    puuid: "player",
    queueId: 420 as const,
    requestedAt: at(0),
    maxAttempts: 2,
    ...overrides,
  };

  // Act
  const result = MatchCollectionJob.create(input);

  // Assert
  expect(result).toEqual(
    Result.fail(expect.any(InvalidMatchCollectionJobError)),
  );
});

it("지원하지 않는 큐를 타입 단언으로 주입해도 거부한다", () => {
  // Arrange
  const input = {
    jobId: "job-1",
    puuid: "player",
    queueId: 420 as const,
    requestedAt: at(0),
    maxAttempts: 2,
  };
  Reflect.set(input, "queueId", 999);

  // Act
  const result = MatchCollectionJob.create(input);

  // Assert
  expect(result).toEqual(
    Result.fail(expect.any(InvalidMatchCollectionJobError)),
  );
});

it.each([
  { ids: ["KR_1", "KR_1"] },
  { ids: [""] },
  { ids: [" "] },
  { ids: [" KR_1"] },
  { ids: Array.from({ length: 21 }, (_, index) => `KR_${index}`) },
])("잘못된 선택 목록 $ids를 거부하고 미확정 상태를 유지한다", ({ ids }) => {
  // Arrange
  const job = runningJob();
  const before = job.snapshot;

  // Act
  const result = job.selectMatches(ids);

  // Assert
  expect(result).toEqual(
    Result.fail(expect.any(InvalidMatchCollectionJobError)),
  );
  expect(job.snapshot).toEqual(before);
});

it("확정한 목록을 다른 목록이나 다른 순서로 교체하지 않는다", () => {
  // Arrange
  const job = runningJob();
  Result.unwrap(job.selectMatches(["KR_2", "KR_1"]));
  const before = job.snapshot;

  // Act
  const changed = job.selectMatches(["new"]);
  const reordered = job.selectMatches(["KR_1", "KR_2"]);

  // Assert
  expect(changed).toEqual(
    Result.fail(expect.any(MatchCollectionJobTransitionError)),
  );
  expect(reordered).toEqual(
    Result.fail(expect.any(MatchCollectionJobTransitionError)),
  );
  expect(job.snapshot).toEqual(before);
});

it.each([
  "SUCCEEDED",
  "PARTIALLY_SUCCEEDED",
] as const)("목록 확정 전에는 %s 결과를 기록하지 않는다", (status) => {
  // Arrange
  const job = runningJob();
  const before = job.snapshot;

  // Act
  const result = job.recordOutcome({ status }, at(2));

  // Assert
  expect(result).toEqual(
    Result.fail(expect.any(MatchCollectionJobTransitionError)),
  );
  expect(job.snapshot).toEqual(before);
});

it("빈 선택 목록의 부분 성공은 허용하지 않는다", () => {
  // Arrange
  const job = runningJob();
  Result.unwrap(job.selectMatches([]));

  // Act
  const result = job.recordOutcome({ status: "PARTIALLY_SUCCEEDED" }, at(2));

  // Assert
  expect(result).toEqual(
    Result.fail(expect.any(InvalidMatchCollectionJobError)),
  );
  expect(job.snapshot.status).toBe("RUNNING");
});

it.each([
  "RIOT_RATE_LIMITED",
  "AUTHENTICATION_FAILED",
  "CONFIGURATION_ERROR",
  "INVALID_RESPONSE",
  "COLLECTION_FAILED",
  "ATTEMPTS_EXHAUSTED",
] as const)("%s 실패를 수집 자동 복구로 돌리지 않는다", (code) => {
  // Arrange
  const job = runningJob();
  const before = job.snapshot;

  // Act
  const result = job.scheduleRetry(
    { code, retryAvailableAt: code === "RIOT_RATE_LIMITED" ? at(10) : null },
    at(5),
    at(2),
  );

  // Assert
  expect(result).toEqual(
    Result.fail(expect.any(MatchCollectionJobTransitionError)),
  );
  expect(job.snapshot).toEqual(before);
});

it.each([
  "start",
  "select",
  "retry",
  "record",
] as const)("결과 기록 후 %s로 수집을 재개하거나 결과를 교체하지 않는다", (action) => {
  // Arrange
  const job = runningJob();
  Result.unwrap(
    job.recordOutcome(
      {
        status: "FAILED",
        failure: { code: "RIOT_RATE_LIMITED", retryAvailableAt: at(10) },
      },
      at(2),
    ),
  );
  const before = job.snapshot;

  // Act
  const result = applyAction(job, action);

  // Assert
  expect(result).toEqual(
    Result.fail(expect.any(MatchCollectionJobTransitionError)),
  );
  expect(job.snapshot).toEqual(before);
});

it.each([
  "SUCCEEDED",
  "PARTIALLY_SUCCEEDED",
  "FAILED",
] as const)("%s로 종료한 작업은 어떤 동작으로도 변경하지 않는다", (status) => {
  // Arrange
  const job = runningJob();
  Result.unwrap(job.selectMatches(["KR_1"]));
  Result.unwrap(
    job.recordOutcome(
      status === "FAILED"
        ? {
            status,
            failure: { code: "COLLECTION_FAILED", retryAvailableAt: null },
          }
        : { status },
      at(2),
    ),
  );
  Result.unwrap(job.finish(at(3)));
  const before = job.snapshot;

  // Act / Assert
  for (const action of [
    "start",
    "select",
    "retry",
    "record",
    "finish",
  ] as const) {
    expect(applyAction(job, action)).toEqual(
      Result.fail(expect.any(MatchCollectionJobTransitionError)),
    );
    expect(job.snapshot).toEqual(before);
  }
});

it.each([
  "select",
  "retry",
  "record",
  "finish",
] as const)("대기 작업에서 %s를 실행하지 않는다", (action) => {
  // Arrange
  const job = newJob();
  const before = job.snapshot;

  // Act
  const result = applyAction(job, action);

  // Assert
  expect(result).toEqual(
    Result.fail(expect.any(MatchCollectionJobTransitionError)),
  );
  expect(job.snapshot).toEqual(before);
});

it.each([
  "start",
  "finish",
] as const)("수집 실행 중 %s로 중복 시작하거나 결과 없이 종료하지 않는다", (action) => {
  // Arrange
  const job = runningJob();
  const before = job.snapshot;

  // Act
  const result = applyAction(job, action);

  // Assert
  expect(result).toEqual(
    Result.fail(expect.any(MatchCollectionJobTransitionError)),
  );
  expect(job.snapshot).toEqual(before);
});

it.each([
  "select",
  "retry",
  "record",
  "finish",
] as const)("복구 대기 중 %s로 수집 실행을 건너뛰지 않는다", (action) => {
  // Arrange
  const job = runningJob();
  Result.unwrap(job.scheduleRetry(temporaryFailure(), at(5), at(2)));
  const before = job.snapshot;

  // Act
  const result = applyAction(job, action);

  // Assert
  expect(result).toEqual(
    Result.fail(expect.any(MatchCollectionJobTransitionError)),
  );
  expect(job.snapshot).toEqual(before);
});

it.each([
  new Date(NaN),
  new Date(-1),
])("잘못되거나 접수보다 이른 시작 시각 %s는 상태를 바꾸지 않는다", (now) => {
  // Arrange
  const job = newJob();
  const before = job.snapshot;

  // Act
  const result = job.start(now);

  // Assert
  expect(result).toEqual(
    Result.fail(expect.any(InvalidMatchCollectionJobError)),
  );
  expect(job.snapshot).toEqual(before);
});

it.each([
  "retry",
  "record",
  "finish",
] as const)("%s 처리 시 마지막 전이보다 이른 시각은 거부한다", (action) => {
  // Arrange
  const job = runningJob();
  if (action === "finish")
    Result.unwrap(
      job.recordOutcome(
        {
          status: "FAILED",
          failure: { code: "COLLECTION_FAILED", retryAvailableAt: null },
        },
        at(2),
      ),
    );
  const before = job.snapshot;

  // Act
  const result =
    action === "retry"
      ? job.scheduleRetry(temporaryFailure(), at(5), at(0))
      : action === "record"
        ? job.recordOutcome(
            {
              status: "FAILED",
              failure: { code: "COLLECTION_FAILED", retryAvailableAt: null },
            },
            at(0),
          )
        : job.finish(at(1));

  // Assert
  expect(result).toEqual(
    Result.fail(expect.any(InvalidMatchCollectionJobError)),
  );
  expect(job.snapshot).toEqual(before);
});

it.each([
  new Date(NaN),
  at(1),
])("무효하거나 현재보다 이른 복구 예정 시각 %s를 거부한다", (nextAttemptAt) => {
  // Arrange
  const job = runningJob();
  const before = job.snapshot;

  // Act
  const result = job.scheduleRetry(temporaryFailure(), nextAttemptAt, at(2));

  // Assert
  expect(result).toEqual(
    Result.fail(expect.any(InvalidMatchCollectionJobError)),
  );
  expect(job.snapshot).toEqual(before);
});

it("실패 결과의 잘못된 재시도 시각을 보정하지 않고 거부한다", () => {
  // Arrange
  const job = runningJob();
  const before = job.snapshot;

  // Act
  const result = job.recordOutcome(
    {
      status: "FAILED",
      failure: { code: "RIOT_RATE_LIMITED", retryAvailableAt: new Date(NaN) },
    },
    at(2),
  );

  // Assert
  expect(result).toEqual(
    Result.fail(expect.any(InvalidMatchCollectionJobError)),
  );
  expect(job.snapshot).toEqual(before);
});

it.each([
  { status: "OTHER" },
  { status: "FAILED", failure: { code: "OTHER", retryAvailableAt: null } },
  {
    status: "FAILED",
    failure: { code: "RIOT_RATE_LIMITED", retryAvailableAt: "later" },
  },
  {
    status: "FAILED",
    failure: { code: "TEMPORARY_FAILURE", retryAvailableAt: at(10) },
  },
])("잘못된 종료 결과 %j를 상태에 기록하지 않는다", (invalid) => {
  // Arrange
  const job = runningJob();
  const outcome: MatchCollectionJobOutcome = { status: "SUCCEEDED" };
  Object.assign(outcome, invalid);
  const before = job.snapshot;

  // Act
  const result = job.recordOutcome(outcome, at(2));

  // Assert
  expect(result).toEqual(
    Result.fail(expect.any(InvalidMatchCollectionJobError)),
  );
  expect(job.snapshot).toEqual(before);
});

it("한도 전에는 시도 소진을 실패 원인으로 기록하지 않는다", () => {
  // Arrange
  const job = runningJob(2);
  const before = job.snapshot;

  // Act
  const result = job.recordOutcome(
    {
      status: "FAILED",
      failure: {
        code: "ATTEMPTS_EXHAUSTED",
        retryAvailableAt: null,
      },
    },
    at(2),
  );

  // Assert
  expect(result).toEqual(
    Result.fail(expect.any(InvalidMatchCollectionJobError)),
  );
  expect(job.snapshot).toEqual(before);
});

/** @description 각 spec이 독립적으로 사용하는 작업을 만들고 기본 시각과 한도만 제공한다. */
function newJob(
  overrides: Partial<
    Pick<
      MatchCollectionJobData,
      "jobId" | "puuid" | "queueId" | "requestedAt" | "maxAttempts"
    >
  > = {},
) {
  return Result.unwrap(
    MatchCollectionJob.create({
      jobId: "job-1",
      puuid: "player",
      queueId: 420,
      requestedAt: at(0),
      maxAttempts: 2,
      ...overrides,
    }),
  );
}

/** @description 상태 전이 검증에 필요한 최초 수집 실행까지 준비한다. */
function runningJob(maxAttempts = 2) {
  const job = newJob({ maxAttempts });
  Result.unwrap(job.start(at(1)));
  return job;
}

/** @description DB나 실제 타이머 없이 초 단위의 명시적인 도메인 시각을 만든다. */
function at(seconds: number): Date {
  return new Date(seconds * 1000);
}

/** @description 재시도 가능한 인프라 실패만 제공하며 각 테스트에서 새 값을 만든다. */
function temporaryFailure(): MatchCollectionJobFailure {
  return { code: "TEMPORARY_FAILURE", retryAvailableAt: null };
}

/** @description 상태별 금지 동작을 같은 유효 입력으로 호출하여 상태 거절 자체를 검증한다. */
function applyAction(
  job: MatchCollectionJob,
  action: "start" | "select" | "retry" | "record" | "finish",
) {
  switch (action) {
    case "start":
      return job.start(at(10));
    case "select":
      return job.selectMatches(["KR_1"]);
    case "retry":
      return job.scheduleRetry(temporaryFailure(), at(11), at(10));
    case "record":
      return job.recordOutcome(
        {
          status: "FAILED",
          failure: { code: "COLLECTION_FAILED", retryAvailableAt: null },
        },
        at(10),
      );
    case "finish":
      return job.finish(at(10));
  }
}
