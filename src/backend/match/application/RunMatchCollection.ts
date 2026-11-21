import { Result } from "@praha/byethrow";
import type { MatchCollectionJobFailure } from "@/backend/match/domain/types/MatchCollectionJobFailure.type";
import type { MatchCollectionJobOutcome } from "@/backend/match/domain/types/MatchCollectionJobOutcome.type";
import { MatchCollectionJobPersistenceError } from "./errors/MatchCollectionJobPersistenceError";
import { MatchCollectionLeaseLostError } from "./errors/MatchCollectionLeaseLostError";
import { MatchCollectionOutcomeSaveError } from "./errors/MatchCollectionOutcomeSaveError";
import type { MatchCollectionCompletion } from "./MatchCollectionCompletion";
import type { MatchCollectionExecution } from "./MatchCollectionExecution";
import type { MatchCollectionProgress } from "./MatchCollectionProgress";
import type { MatchCollectionSource } from "./MatchCollectionSource";
import type { ClaimedMatchCollectionJob } from "./types/ClaimedMatchCollectionJob.type";
import type { CollectedMatchBatch } from "./types/CollectedMatchBatch.type";
import type { ExecutionLease } from "./types/ExecutionLease.type";
import type { MatchCollectionJobWriteError } from "./types/MatchCollectionJobWriteError.type";

/** @description 선점한 작업의 고정 목록 수집을 조율하고 복구 예약 또는 종료 확정 권한을 반환한다. */
export class RunMatchCollection {
  /** @description 실행 권한·진행 저장·결과 기록·외부 수집 경계를 주입한다. */
  constructor(
    private readonly execution: MatchCollectionExecution,
    private readonly progress: MatchCollectionProgress,
    private readonly completion: MatchCollectionCompletion,
    private readonly source: MatchCollectionSource,
  ) {}

  /** @description null은 복구 예약이며 작업 반환은 FINALIZING이다. 결과 기록 실패에는 관측한 결론을 보존한다. */
  async execute(
    assignment: ClaimedMatchCollectionJob,
    signal: AbortSignal,
  ): Promise<
    Result.Result<
      ClaimedMatchCollectionJob | null,
      MatchCollectionJobWriteError | MatchCollectionOutcomeSaveError
    >
  > {
    if (
      assignment.lease.purpose !== "COLLECT" ||
      assignment.job.status !== "RUNNING" ||
      assignment.job.jobId !== assignment.lease.jobId
    ) {
      return Result.fail(new MatchCollectionLeaseLostError());
    }
    const active = await this.activeLease(assignment.lease, signal);
    if (Result.isFailure(active)) return active;
    const prepared = await this.prepare(
      { job: assignment.job, lease: active.value },
      signal,
    );
    if (
      Result.isFailure(prepared) ||
      prepared.value === null ||
      prepared.value.job.status === "FINALIZING"
    )
      return prepared;
    const current = prepared.value;
    const ids = current.job.selectedMatchIds;
    if (ids === null)
      return Result.fail(
        new MatchCollectionJobPersistenceError({
          retryable: false,
          cause: new Error("선택 목록 미확정"),
        }),
      );
    if (ids.length === 0)
      return this.record(current.lease, { status: "SUCCEEDED" });
    const renewed = await this.activeLease(current.lease, signal);
    if (Result.isFailure(renewed)) return renewed;
    const collected = await this.source.collectSelection(
      { puuid: current.job.puuid, queueId: current.job.queueId },
      ids,
      signal,
    );
    if (Result.isFailure(collected))
      return this.settle(renewed.value, collected.error.failure, signal);
    return this.persistBatch(
      { job: current.job, lease: renewed.value },
      collected.value,
      signal,
    );
  }

  /** @description 복구 목록을 유지하고 최초 목록은 저장 성공을 확인한 뒤에만 상세 수집에 전달한다. */
  private async prepare(
    assignment: ClaimedMatchCollectionJob,
    signal: AbortSignal,
  ): Promise<
    Result.Result<
      ClaimedMatchCollectionJob | null,
      MatchCollectionJobWriteError | MatchCollectionOutcomeSaveError
    >
  > {
    if (assignment.job.selectedMatchIds !== null)
      return Result.succeed(assignment);
    const selection = await this.source.findSelection(
      { puuid: assignment.job.puuid, queueId: assignment.job.queueId },
      signal,
    );
    if (Result.isFailure(selection))
      return this.settle(assignment.lease, selection.error.failure, signal);
    const active = await this.activeLease(assignment.lease, signal);
    if (Result.isFailure(active)) return active;
    const saved = await this.progress.saveSelection(
      active.value,
      selection.value,
    );
    return Result.isFailure(saved)
      ? this.storageFailure(active.value, saved.error, signal)
      : saved;
  }

  /** @description 429는 캐시보다 먼저 기록하고 다른 결과는 권한을 재확인한 뒤 확보 경기를 저장한다. */
  private async persistBatch(
    assignment: ClaimedMatchCollectionJob,
    batch: CollectedMatchBatch,
    signal: AbortSignal,
  ): Promise<
    Result.Result<
      ClaimedMatchCollectionJob | null,
      MatchCollectionJobWriteError | MatchCollectionOutcomeSaveError
    >
  > {
    if (
      batch.outcome.status === "FAILED" &&
      batch.outcome.failure.code === "RIOT_RATE_LIMITED"
    )
      return this.record(assignment.lease, batch.outcome);
    const active = await this.activeLease(assignment.lease, signal);
    if (Result.isFailure(active)) return active;
    if (!this.matchesTarget(assignment, batch)) {
      return this.record(active.value, {
        status: "FAILED",
        failure: { code: "INVALID_RESPONSE", retryAvailableAt: null },
      });
    }
    if (batch.matches.length > 0) {
      const saved = await this.progress.saveMatches(
        active.value,
        batch.matches,
      );
      if (Result.isFailure(saved)) {
        return this.cacheFailure(
          active.value,
          saved.error,
          batch.outcome,
          signal,
        );
      }
    }
    return this.record(active.value, batch.outcome);
  }

  /** @description 확보 경기 저장이 실패해도 이미 확인한 영구 수집 오류를 일시적 복구로 바꾸지 않는다. */
  private async cacheFailure(
    lease: ExecutionLease,
    error: MatchCollectionJobWriteError,
    outcome: MatchCollectionJobOutcome,
    signal: AbortSignal,
  ): Promise<
    Result.Result<
      ClaimedMatchCollectionJob | null,
      MatchCollectionJobWriteError | MatchCollectionOutcomeSaveError
    >
  > {
    if (error instanceof MatchCollectionLeaseLostError)
      return Result.fail(error);
    if (outcome.status !== "FAILED")
      return this.storageFailure(lease, error, signal);
    const recorded = await this.record(lease, outcome);
    if (Result.isSuccess(recorded)) return Result.fail(error);
    if (recorded.error instanceof MatchCollectionLeaseLostError)
      return recorded;
    return Result.fail(
      new MatchCollectionOutcomeSaveError({
        outcome,
        lease,
        cause: { cacheError: error, outcomeError: recorded.error },
      }),
    );
  }

  /** @description 수집 경계가 반환한 경기도 대상·큐·고정 목록과 일치해야 저장한다. */
  private matchesTarget(
    assignment: ClaimedMatchCollectionJob,
    batch: CollectedMatchBatch,
  ): boolean {
    const ids = new Set(assignment.job.selectedMatchIds);
    const seen = new Set<string>();
    return batch.matches.every((match) => {
      if (
        match.puuid !== assignment.job.puuid ||
        match.queueId !== assignment.job.queueId ||
        !ids.has(match.matchId) ||
        seen.has(match.matchId)
      )
        return false;
      seen.add(match.matchId);
      return true;
    });
  }

  /** @description 취소·권한 갱신 실패 후에는 새로운 외부 수집이나 복구 쓰기를 시작하지 않는다. */
  private async activeLease(
    lease: ExecutionLease,
    signal: AbortSignal,
  ): Promise<Result.Result<ExecutionLease, MatchCollectionJobWriteError>> {
    if (signal.aborted) return Result.fail(new MatchCollectionLeaseLostError());
    const renewed = await this.execution.renew(lease);
    return signal.aborted
      ? Result.fail(new MatchCollectionLeaseLostError())
      : renewed;
  }

  /** @description 분류된 일시 장애만 복구 예약하고 429·영구 오류는 종료 결과로 남긴다. */
  private async settle(
    lease: ExecutionLease,
    failure: MatchCollectionJobFailure,
    signal: AbortSignal,
  ): Promise<
    Result.Result<
      ClaimedMatchCollectionJob | null,
      MatchCollectionJobWriteError | MatchCollectionOutcomeSaveError
    >
  > {
    if (failure.code === "RIOT_RATE_LIMITED")
      return this.record(lease, { status: "FAILED", failure });
    const active = await this.activeLease(lease, signal);
    if (Result.isFailure(active)) return active;
    return failure.code === "TEMPORARY_FAILURE" ||
      failure.code === "WORKER_INTERRUPTED"
      ? this.execution.scheduleRetry(active.value, failure)
      : this.record(active.value, { status: "FAILED", failure });
  }

  /** @description 저장 장애의 재시도 가능 분류를 사용하되 권한 상실을 일반 장애로 바꾸지 않는다. */
  private storageFailure(
    lease: ExecutionLease,
    error: MatchCollectionJobWriteError,
    signal: AbortSignal,
  ): Promise<
    Result.Result<
      ClaimedMatchCollectionJob | null,
      MatchCollectionJobWriteError | MatchCollectionOutcomeSaveError
    >
  > {
    if (error instanceof MatchCollectionLeaseLostError)
      return Promise.resolve(Result.fail(error));
    return this.settle(
      lease,
      {
        code: error.retryable ? "TEMPORARY_FAILURE" : "COLLECTION_FAILED",
        retryAvailableAt: null,
      },
      signal,
    );
  }

  /** @description 기록 응답 유실을 일반 수집 재시도로 바꾸지 않도록 관측 결과와 권한을 오류에 남긴다. */
  private async record(
    lease: ExecutionLease,
    outcome: MatchCollectionJobOutcome,
  ): Promise<
    Result.Result<
      ClaimedMatchCollectionJob,
      MatchCollectionJobWriteError | MatchCollectionOutcomeSaveError
    >
  > {
    const recorded = await this.completion.recordOutcome(lease, outcome);
    if (
      Result.isSuccess(recorded) ||
      recorded.error instanceof MatchCollectionLeaseLostError
    )
      return recorded;
    return Result.fail(
      new MatchCollectionOutcomeSaveError({
        cause: recorded.error,
        lease,
        outcome,
      }),
    );
  }
}
