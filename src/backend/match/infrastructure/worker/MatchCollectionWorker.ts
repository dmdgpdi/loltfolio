import { Result } from "@praha/byethrow";
import { MatchCollectionLeaseLostError } from "@/backend/match/application/errors/MatchCollectionLeaseLostError";
import { MatchCollectionOutcomeSaveError } from "@/backend/match/application/errors/MatchCollectionOutcomeSaveError";
import type { ClaimedMatchCollectionJob } from "@/backend/match/application/types/ClaimedMatchCollectionJob.type";
import type { ExecutionLease } from "@/backend/match/application/types/ExecutionLease.type";
import type { MatchCollectionWorkerDependencies } from "./MatchCollectionWorkerDependencies.type";
import type { MatchCollectionWorkerSettings } from "./MatchCollectionWorkerSettings.type";

/** @description DB 작업을 순차 실행하고 종료·권한 상실을 수집 요청에 전달한다. 운영 플랫폼에 의존하지 않는다. */
export class MatchCollectionWorker {
  private readonly settings: MatchCollectionWorkerSettings;

  /** @description 주입 설정을 복사하고 갱신이 만료보다 먼저 이루어지는지 검사한다. */
  constructor(
    private readonly dependencies: MatchCollectionWorkerDependencies,
    settings: MatchCollectionWorkerSettings,
    private readonly report: (cause: unknown, jobId?: string) => void,
  ) {
    if (
      ![
        settings.leaseDurationMs,
        settings.heartbeatIntervalMs,
        settings.retryDelayMs,
        settings.idlePollIntervalMs,
      ].every(
        (value) => Number.isInteger(value) && value > 0 && value <= 2147483647,
      ) ||
      settings.heartbeatIntervalMs >= settings.leaseDurationMs ||
      !Number.isSafeInteger(settings.maxAttempts) ||
      settings.maxAttempts < 1
    )
      throw new RangeError("워커 실행 설정을 확인하세요.");
    this.settings = { ...settings };
  }

  /** @description 한 번에 한 작업만 처리하며 대기·오류 반복에는 지연을 적용하고 종료 후 새 선점을 하지 않는다. */
  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        const claimed = await this.dependencies.execution.claimNext();
        if (Result.isFailure(claimed)) {
          this.report(claimed.error);
          await wait(this.settings.retryDelayMs, signal);
        } else if (claimed.value === null)
          await wait(this.settings.idlePollIntervalMs, signal);
        else if (!signal.aborted) await this.process(claimed.value, signal);
      } catch (cause) {
        this.report(cause);
        if (cause instanceof MatchCollectionOutcomeSaveError && !signal.aborted)
          throw cause;
        await wait(this.settings.retryDelayMs, signal);
      }
    }
  }

  /** @description 수집과 종료 권한의 heartbeat를 분리해 목적 변경 후 이전 토큰을 재사용하지 않는다. */
  private async process(
    assignment: ClaimedMatchCollectionJob,
    signal: AbortSignal,
  ): Promise<void> {
    const finalizing =
      assignment.lease.purpose === "FINALIZE"
        ? assignment
        : await this.withHeartbeat(assignment.lease, signal, (active) =>
            this.collect(assignment, active),
          );
    if (finalizing && !signal.aborted)
      await this.withHeartbeat(finalizing.lease, signal, (active) =>
        this.finalize(finalizing, active),
      );
  }

  /** @description 관측한 결과 기록 실패는 별도 복구하며 같은 수집 유스케이스를 다시 호출하지 않는다. */
  private async collect(
    assignment: ClaimedMatchCollectionJob,
    signal: AbortSignal,
  ): Promise<ClaimedMatchCollectionJob | null> {
    const result = await this.dependencies.collect.execute(assignment, signal);
    if (Result.isSuccess(result)) return result.value;
    this.report(result.error, assignment.job.jobId);
    return result.error instanceof MatchCollectionOutcomeSaveError
      ? this.recoverOutcome(result.error, signal)
      : null;
  }

  /** @description 결과 커밋 여부를 확인하고 미저장 RUNNING에서만 알려진 결과를 다시 기록한다. 이미 기록됐다면 종료 재선점에 맡긴다. */
  private async recoverOutcome(
    error: MatchCollectionOutcomeSaveError,
    signal: AbortSignal,
  ): Promise<ClaimedMatchCollectionJob | null> {
    while (!signal.aborted) {
      const found = await this.dependencies.query.findById(error.lease.jobId);
      if (Result.isFailure(found)) {
        this.report(found.error, error.lease.jobId);
        await wait(this.settings.retryDelayMs, signal);
        continue;
      }
      if (found.value?.job.status !== "RUNNING") return null;
      if (signal.aborted) throw error;
      const saved = await this.dependencies.completion.recordOutcome(
        error.lease,
        error.outcome,
      );
      if (Result.isSuccess(saved)) return saved.value;
      this.report(saved.error, error.lease.jobId);
      if (saved.error instanceof MatchCollectionLeaseLostError) return null;
      await wait(this.settings.retryDelayMs, signal);
    }
    throw error;
  }

  /** @description 완료 응답 유실은 상태 조회로 확인하고 미확정 결과의 종료만 지연 후 재시도한다. */
  private async finalize(
    assignment: ClaimedMatchCollectionJob,
    signal: AbortSignal,
  ): Promise<void> {
    while (!signal.aborted) {
      const finished = await this.dependencies.finalize.execute(
        assignment,
        signal,
      );
      if (Result.isSuccess(finished)) return;
      this.report(finished.error, assignment.job.jobId);
      if (finished.error instanceof MatchCollectionLeaseLostError) return;
      const found = await this.dependencies.query.findById(
        assignment.job.jobId,
      );
      if (
        Result.isSuccess(found) &&
        found.value &&
        found.value.job.finishedAt !== null
      )
        return;
      if (Result.isFailure(found))
        this.report(found.error, assignment.job.jobId);
      await wait(this.settings.retryDelayMs, signal);
    }
  }

  /** @description heartbeat 실패는 진행 중인 실행에 전달한다. 결과 저장에서 이미 발급된 새 권한은 이전 권한의 갱신 실패와 별개로 반환한다. */
  private async withHeartbeat<T>(
    lease: ExecutionLease,
    parent: AbortSignal,
    action: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const failed = new AbortController();
    const stop = new AbortController();
    const signal = AbortSignal.any([parent, failed.signal]);
    const heartbeat = this.heartbeat(
      lease,
      failed,
      AbortSignal.any([signal, stop.signal]),
    );
    try {
      return await action(signal);
    } finally {
      stop.abort();
      await heartbeat;
    }
  }

  /** @description 갱신을 중첩하지 않으며 실패 후 새 Riot 요청이 시작되지 않도록 취소 신호를 발생시킨다. */
  private async heartbeat(
    lease: ExecutionLease,
    failed: AbortController,
    signal: AbortSignal,
  ): Promise<void> {
    while (!signal.aborted) {
      await wait(this.settings.heartbeatIntervalMs, signal);
      if (signal.aborted) return;
      try {
        const renewed = await this.dependencies.execution.renew(lease);
        if (Result.isSuccess(renewed)) continue;
        this.report(renewed.error, lease.jobId);
      } catch (cause) {
        this.report(cause, lease.jobId);
      }
      failed.abort();
      return;
    }
  }
}

/** @description 대기 타이머와 리스너를 종료 신호로 즉시 정리한다. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
  });
}
