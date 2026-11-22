import { Result } from "@praha/byethrow";
import { InvalidMatchCollectionJobError } from "./errors/InvalidMatchCollectionJobError";
import { MatchCollectionJobTransitionError } from "./errors/MatchCollectionJobTransitionError";
import { QueueId } from "./QueueId";
import type { MatchCollectionJobData } from "./types/MatchCollectionJobData.type";
import type { MatchCollectionJobFailure } from "./types/MatchCollectionJobFailure.type";
import type { MatchCollectionJobOutcome } from "./types/MatchCollectionJobOutcome.type";

/** @description 작업 한 건의 수집·복구·결과 확정 규칙을 관리하며 DB 선점과 실행 권한은 담당하지 않는다. */
export class MatchCollectionJob {
  /** @description 검증한 생성 기록만 보관하고 이후 시각의 역행을 방지한다. */
  private constructor(private data: MatchCollectionJobData) {}

  /** @description 대상과 생성 시각을 검증하고 이 작업에 적용할 수집 시도 한도를 고정한다. */
  static create(
    input: Pick<
      MatchCollectionJobData,
      "jobId" | "puuid" | "queueId" | "requestedAt" | "maxAttempts"
    >,
  ): Result.Result<MatchCollectionJob, InvalidMatchCollectionJobError> {
    if (
      !(
        isIdentifier(input.jobId) &&
        isIdentifier(input.puuid) &&
        Object.values(QueueId).includes(input.queueId) &&
        isDate(input.requestedAt) &&
        Number.isSafeInteger(input.maxAttempts)
      ) ||
      input.maxAttempts < 1
    ) {
      return Result.fail(new InvalidMatchCollectionJobError());
    }

    return Result.succeed(
      new MatchCollectionJob({
        jobId: input.jobId,
        puuid: input.puuid,
        queueId: input.queueId,
        maxAttempts: input.maxAttempts,
        requestedAt: new Date(input.requestedAt),
        updatedAt: new Date(input.requestedAt),
        status: "QUEUED",
        startedAt: null,
        finishedAt: null,
        selectedMatchIds: null,
        attemptCount: 0,
        nextAttemptAt: null,
        lastFailure: null,
        outcome: null,
      }),
    );
  }

  /** @description 저장된 전체 기록의 불변 조건을 검사하고 마지막 전이 시각과 고정 목록을 유지해 복원한다. */
  static restore(
    data: MatchCollectionJobData,
  ): Result.Result<MatchCollectionJob, InvalidMatchCollectionJobError> {
    if (!isRestorable(data))
      return Result.fail(new InvalidMatchCollectionJobError());
    const job = new MatchCollectionJob(data);
    return Result.succeed(new MatchCollectionJob(job.snapshot));
  }

  /** @description 시각은 복사하고 목록·결과는 동결하여 반환 기록의 변경이 내부 작업에 전파되지 않게 한다. */
  get snapshot(): MatchCollectionJobData {
    return Object.freeze({
      ...this.data,
      requestedAt: new Date(this.data.requestedAt),
      updatedAt: new Date(this.data.updatedAt),
      startedAt:
        this.data.startedAt === null ? null : new Date(this.data.startedAt),
      finishedAt:
        this.data.finishedAt === null ? null : new Date(this.data.finishedAt),
      nextAttemptAt:
        this.data.nextAttemptAt === null
          ? null
          : new Date(this.data.nextAttemptAt),
      selectedMatchIds:
        this.data.selectedMatchIds === null
          ? null
          : Object.freeze([...this.data.selectedMatchIds]),
      lastFailure:
        this.data.lastFailure === null
          ? null
          : copyFailure(this.data.lastFailure),
      outcome:
        this.data.outcome === null ? null : copyOutcome(this.data.outcome),
    });
  }

  /** @description 최초 실행 또는 예정 시각이 지난 복구 실행만 시작하며 최초 시작 시각과 선택 목록은 유지한다. */
  start(
    now: Date,
  ): Result.Result<
    void,
    InvalidMatchCollectionJobError | MatchCollectionJobTransitionError
  > {
    if (this.data.status !== "QUEUED" && this.data.status !== "RETRY_WAIT") {
      return Result.fail(new MatchCollectionJobTransitionError());
    }
    if (!this.isCurrentTime(now))
      return Result.fail(new InvalidMatchCollectionJobError());
    if (
      this.data.attemptCount >= this.data.maxAttempts ||
      (this.data.nextAttemptAt !== null &&
        now.getTime() < this.data.nextAttemptAt.getTime())
    ) {
      return Result.fail(new MatchCollectionJobTransitionError());
    }

    this.data = {
      ...this.data,
      status: "RUNNING",
      attemptCount: this.data.attemptCount + 1,
      startedAt: this.data.startedAt ?? new Date(now),
      nextAttemptAt: null,
    };
    this.data = { ...this.data, updatedAt: new Date(now) };
    return Result.succeed(undefined);
  }

  /** @description 실행 중 확보한 최초 최대 20개 목록을 고정한다. 같은 목록 확인은 허용하되 교체·재정렬은 거부한다. */
  selectMatches(
    ids: readonly string[],
  ): Result.Result<
    void,
    InvalidMatchCollectionJobError | MatchCollectionJobTransitionError
  > {
    if (this.data.status !== "RUNNING")
      return Result.fail(new MatchCollectionJobTransitionError());
    if (
      !Array.isArray(ids) ||
      ids.length > 20 ||
      new Set(ids).size !== ids.length ||
      !ids.every(isIdentifier)
    ) {
      return Result.fail(new InvalidMatchCollectionJobError());
    }
    if (this.data.selectedMatchIds !== null) {
      return this.data.selectedMatchIds.length === ids.length &&
        this.data.selectedMatchIds.every((id, index) => id === ids[index])
        ? Result.succeed(undefined)
        : Result.fail(new MatchCollectionJobTransitionError());
    }

    this.data = { ...this.data, selectedMatchIds: Object.freeze([...ids]) };
    return Result.succeed(undefined);
  }

  /** @description 워커 중단·일시 장애만 복구 대기로 옮기며 수집 한도 소진 시 원인을 보존해 실패 확정으로 넘긴다. */
  scheduleRetry(
    failure: MatchCollectionJobFailure,
    nextAttemptAt: Date,
    now: Date,
  ): Result.Result<
    void,
    InvalidMatchCollectionJobError | MatchCollectionJobTransitionError
  > {
    if (this.data.status !== "RUNNING")
      return Result.fail(new MatchCollectionJobTransitionError());
    if (
      !(this.isCurrentTime(now) && isDate(nextAttemptAt)) ||
      nextAttemptAt.getTime() < now.getTime() ||
      !isFailure(failure)
    ) {
      return Result.fail(new InvalidMatchCollectionJobError());
    }
    if (
      failure.code !== "WORKER_INTERRUPTED" &&
      failure.code !== "TEMPORARY_FAILURE"
    ) {
      return Result.fail(new MatchCollectionJobTransitionError());
    }

    if (this.data.attemptCount >= this.data.maxAttempts) {
      this.setOutcome(
        {
          status: "FAILED",
          failure: { code: "ATTEMPTS_EXHAUSTED", retryAvailableAt: null },
        },
        failure,
        now,
      );
    } else {
      this.data = {
        ...this.data,
        status: "RETRY_WAIT",
        nextAttemptAt: new Date(nextAttemptAt),
        lastFailure: copyFailure(failure),
      };
      this.data = { ...this.data, updatedAt: new Date(now) };
    }
    return Result.succeed(undefined);
  }

  /** @description 수집 결과를 고정하고 종료 확정만 허용한다. 성공에는 확정 목록이 필요하며 실패는 목록 조회 전에도 가능하다. */
  recordOutcome(
    outcome: MatchCollectionJobOutcome,
    now: Date,
  ): Result.Result<
    void,
    InvalidMatchCollectionJobError | MatchCollectionJobTransitionError
  > {
    if (this.data.status !== "RUNNING")
      return Result.fail(new MatchCollectionJobTransitionError());
    if (!(this.isCurrentTime(now) && isOutcome(outcome))) {
      return Result.fail(new InvalidMatchCollectionJobError());
    }
    if (outcome.status !== "FAILED" && this.data.selectedMatchIds === null) {
      return Result.fail(new MatchCollectionJobTransitionError());
    }
    if (
      outcome.status === "PARTIALLY_SUCCEEDED" &&
      this.data.selectedMatchIds?.length === 0
    ) {
      return Result.fail(new InvalidMatchCollectionJobError());
    }
    if (
      outcome.status === "FAILED" &&
      outcome.failure.code === "ATTEMPTS_EXHAUSTED" &&
      this.data.attemptCount < this.data.maxAttempts
    ) {
      return Result.fail(new InvalidMatchCollectionJobError());
    }

    this.setOutcome(
      outcome,
      outcome.status === "FAILED" ? outcome.failure : this.data.lastFailure,
      now,
    );
    return Result.succeed(undefined);
  }

  /** @description 이미 기록한 결과로만 종료한다. DB 작업·MatchSync의 원자적 저장은 이후 영속성 계약이 담당한다. */
  finish(
    now: Date,
  ): Result.Result<
    void,
    InvalidMatchCollectionJobError | MatchCollectionJobTransitionError
  > {
    if (this.data.status !== "FINALIZING" || this.data.outcome === null) {
      return Result.fail(new MatchCollectionJobTransitionError());
    }
    if (!this.isCurrentTime(now))
      return Result.fail(new InvalidMatchCollectionJobError());

    this.data = {
      ...this.data,
      status: this.data.outcome.status,
      finishedAt: new Date(now),
    };
    this.data = { ...this.data, updatedAt: new Date(now) };
    return Result.succeed(undefined);
  }

  /** @description 외부에서 주입한 유효 시각이 마지막 상태 전이보다 이르지 않은지 확인한다. */
  private isCurrentTime(now: Date): boolean {
    return isDate(now) && now.getTime() >= this.data.updatedAt.getTime();
  }

  /** @description 수집 결과와 마지막 장애 원인을 분리해 기록하고 더 이상의 수집 예약을 제거한다. */
  private setOutcome(
    outcome: MatchCollectionJobOutcome,
    lastFailure: MatchCollectionJobFailure | null,
    now: Date,
  ): void {
    this.data = {
      ...this.data,
      status: "FINALIZING",
      outcome: copyOutcome(outcome),
      lastFailure: lastFailure === null ? null : copyFailure(lastFailure),
      nextAttemptAt: null,
    };
    this.data = { ...this.data, updatedAt: new Date(now) };
  }
}

/** @description 식별자는 공백 보정 없이 유효성을 판단하여 잘못된 입력을 다른 대상으로 바꾸지 않는다. */
function isIdentifier(value: string): boolean {
  return (
    typeof value === "string" && value.length > 0 && value === value.trim()
  );
}

/** @description 무효 Date와 날짜가 아닌 런타임 입력을 상태에 보관하지 않는다. */
function isDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

/** @description 오류 원본 대신 사전 정의한 실패 분류와 API 재시도 시각만 허용한다. */
function isFailure(failure: MatchCollectionJobFailure): boolean {
  const codes: readonly MatchCollectionJobFailure["code"][] = [
    "WORKER_INTERRUPTED",
    "TEMPORARY_FAILURE",
    "RIOT_RATE_LIMITED",
    "AUTHENTICATION_FAILED",
    "CONFIGURATION_ERROR",
    "INVALID_RESPONSE",
    "COLLECTION_FAILED",
    "ATTEMPTS_EXHAUSTED",
  ];
  return (
    failure !== null &&
    typeof failure === "object" &&
    codes.includes(failure.code) &&
    (failure.retryAvailableAt === null ||
      (failure.code === "RIOT_RATE_LIMITED" &&
        isDate(failure.retryAvailableAt)))
  );
}

/** @description 종료 결과의 판별자와 실패 계약을 함께 확인한다. */
function isOutcome(outcome: MatchCollectionJobOutcome): boolean {
  return (
    outcome !== null &&
    typeof outcome === "object" &&
    (outcome.status === "SUCCEEDED" ||
      outcome.status === "PARTIALLY_SUCCEEDED" ||
      (outcome.status === "FAILED" && isFailure(outcome.failure)))
  );
}

/** @description 실패 값의 중첩 Date를 복사하여 입력·스냅샷 변경을 내부 상태와 분리한다. */
function copyFailure(
  failure: MatchCollectionJobFailure,
): MatchCollectionJobFailure {
  return Object.freeze({
    code: failure.code,
    retryAvailableAt:
      failure.retryAvailableAt === null
        ? null
        : new Date(failure.retryAvailableAt),
  });
}

/** @description 종료 결과와 실패 정보를 복사·동결하여 외부 참조를 보관하지 않는다. */
function copyOutcome(
  outcome: MatchCollectionJobOutcome,
): MatchCollectionJobOutcome {
  return outcome.status === "FAILED"
    ? Object.freeze({
        status: outcome.status,
        failure: copyFailure(outcome.failure),
      })
    : Object.freeze({ status: outcome.status });
}

/** @description 생성 계약에 더해 시각·시도 횟수와 각 상태의 필수 필드 관계를 검증한다. */
function isRestorable(data: MatchCollectionJobData): boolean {
  if (!(data && Result.isSuccess(MatchCollectionJob.create(data))))
    return false;
  if (
    !isDate(data.updatedAt) ||
    data.updatedAt < data.requestedAt ||
    !Number.isSafeInteger(data.attemptCount) ||
    data.attemptCount < 0 ||
    data.attemptCount > data.maxAttempts
  )
    return false;
  if (
    data.selectedMatchIds !== null &&
    (!Array.isArray(data.selectedMatchIds) ||
      data.selectedMatchIds.length > 20 ||
      !data.selectedMatchIds.every(isIdentifier) ||
      new Set(data.selectedMatchIds).size !== data.selectedMatchIds.length)
  )
    return false;
  if (
    (data.lastFailure !== null && !isFailure(data.lastFailure)) ||
    (data.outcome !== null && !isOutcome(data.outcome))
  )
    return false;
  return hasRestorableState(data);
}

/** @description 대기와 실행 기록의 필수 필드 관계를 검증한다. */
function hasRestorableState(data: MatchCollectionJobData): boolean {
  if (data.status === "QUEUED")
    return (
      data.attemptCount === 0 &&
      data.startedAt === null &&
      data.finishedAt === null &&
      data.nextAttemptAt === null &&
      data.selectedMatchIds === null &&
      data.lastFailure === null &&
      data.outcome === null &&
      data.updatedAt.getTime() === data.requestedAt.getTime()
    );
  if (
    data.attemptCount < 1 ||
    !isDate(data.startedAt) ||
    data.startedAt < data.requestedAt ||
    data.startedAt > data.updatedAt
  )
    return false;
  const retryable =
    data.lastFailure !== null &&
    ["WORKER_INTERRUPTED", "TEMPORARY_FAILURE"].includes(data.lastFailure.code);
  if (data.status === "RUNNING")
    return (
      data.finishedAt === null &&
      data.nextAttemptAt === null &&
      data.outcome === null &&
      (data.lastFailure === null || retryable)
    );
  if (data.status === "RETRY_WAIT")
    return (
      data.finishedAt === null &&
      data.outcome === null &&
      retryable &&
      data.attemptCount < data.maxAttempts &&
      isDate(data.nextAttemptAt) &&
      data.nextAttemptAt >= data.updatedAt
    );
  return hasRestorableOutcome(data, retryable);
}

/** @description 결과 확정과 종료 상태의 결과·실패·종료 시각 일관성을 검증한다. */
function hasRestorableOutcome(
  data: MatchCollectionJobData,
  retryable: boolean,
): boolean {
  if (data.outcome === null || data.nextAttemptAt !== null) return false;
  if (
    data.outcome.status !== "FAILED" &&
    (data.selectedMatchIds === null ||
      (data.outcome.status === "PARTIALLY_SUCCEEDED" &&
        data.selectedMatchIds.length === 0))
  )
    return false;
  if (!hasConsistentFailure(data, data.outcome, retryable)) return false;
  if (data.status === "FINALIZING") return data.finishedAt === null;
  return (
    data.status === data.outcome.status &&
    isDate(data.finishedAt) &&
    data.finishedAt.getTime() === data.updatedAt.getTime()
  );
}

/** @description 한도 소진 시 실제 장애를 보존하고 그 외 실패는 확정 결과와 일치하는지 확인한다. */
function hasConsistentFailure(
  data: MatchCollectionJobData,
  outcome: MatchCollectionJobOutcome,
  retryable: boolean,
): boolean {
  if (outcome.status !== "FAILED")
    return data.lastFailure === null || retryable;
  if (outcome.failure.code === "ATTEMPTS_EXHAUSTED")
    return (
      data.attemptCount === data.maxAttempts &&
      (retryable || data.lastFailure?.code === "ATTEMPTS_EXHAUSTED")
    );
  return (
    data.lastFailure?.code === outcome.failure.code &&
    data.lastFailure.retryAvailableAt?.getTime() ===
      outcome.failure.retryAvailableAt?.getTime()
  );
}
