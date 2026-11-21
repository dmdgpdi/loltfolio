import { Result } from "@praha/byethrow";
import { MatchCollectionAdmissionRejectedError } from "@/backend/match/application/errors/MatchCollectionAdmissionRejectedError";
import { MatchCollectionJobPersistenceError } from "@/backend/match/application/errors/MatchCollectionJobPersistenceError";
import { MatchCollectionLeaseLostError } from "@/backend/match/application/errors/MatchCollectionLeaseLostError";
import type { MatchCollectionAdmission } from "@/backend/match/application/MatchCollectionAdmission";
import type { MatchCollectionCompletion } from "@/backend/match/application/MatchCollectionCompletion";
import type { MatchCollectionExecution } from "@/backend/match/application/MatchCollectionExecution";
import type { MatchCollectionJobQuery } from "@/backend/match/application/MatchCollectionJobQuery";
import type { MatchCollectionProgress } from "@/backend/match/application/MatchCollectionProgress";
import type { ClaimedMatchCollectionJob } from "@/backend/match/application/types/ClaimedMatchCollectionJob.type";
import type { ExecutionLease } from "@/backend/match/application/types/ExecutionLease.type";
import type { MatchCollectionJobWriteError } from "@/backend/match/application/types/MatchCollectionJobWriteError.type";
import type { MatchCollectionTarget } from "@/backend/match/application/types/MatchCollectionTarget.type";
import { MatchCollectionJob } from "@/backend/match/domain/MatchCollectionJob";
import { MatchSync } from "@/backend/match/domain/MatchSync";
import type { PlayerMatch } from "@/backend/match/domain/PlayerMatch";
import type { MatchCollectionJobFailure } from "@/backend/match/domain/types/MatchCollectionJobFailure.type";
import type { MatchCollectionJobOutcome } from "@/backend/match/domain/types/MatchCollectionJobOutcome.type";

/** @description 실제 작업·MatchSync를 사용하는 Application 테스트 대역이다. DB 경쟁·트랜잭션의 증거로 사용하지 않는다. */
export class MemoryMatchCollectionJobs
  implements
    MatchCollectionAdmission,
    MatchCollectionExecution,
    MatchCollectionProgress,
    MatchCollectionCompletion,
    MatchCollectionJobQuery
{
  now = new Date(0);
  readonly jobs = new Map<string, MatchCollectionJob>();
  readonly syncs = new Map<string, MatchSync>();
  readonly savedMatches: PlayerMatch[] = [];
  readonly leases = new Map<string, ExecutionLease>();
  readError: MatchCollectionJobPersistenceError | null = null;
  admissionError: MatchCollectionJobPersistenceError | null = null;
  renewError: MatchCollectionJobWriteError | null = null;
  selectionError: MatchCollectionJobWriteError | null = null;
  matchesError: MatchCollectionJobWriteError | null = null;
  outcomeError: MatchCollectionJobWriteError | null = null;
  outcomeCommitError: MatchCollectionJobPersistenceError | null = null;
  finishError: MatchCollectionJobWriteError | null = null;
  finishCommitError: MatchCollectionJobPersistenceError | null = null;
  retryError: MatchCollectionJobWriteError | null = null;
  private tokenSequence = 0;

  /** @description 같은 대상의 활성 작업을 공유하고 실제 MatchSync의 접수 제한을 적용한다. */
  async admit(
    target: MatchCollectionTarget,
    maxAttempts: number,
  ): ReturnType<MatchCollectionAdmission["admit"]> {
    if (this.admissionError) return Result.fail(this.admissionError);
    for (const job of this.jobs.values()) {
      const data = job.snapshot;
      if (
        data.puuid === target.puuid &&
        data.queueId === target.queueId &&
        data.finishedAt === null
      ) {
        return Result.succeed({ jobId: data.jobId, created: false });
      }
    }
    const key = JSON.stringify([target.puuid, target.queueId]);
    const sync =
      this.syncs.get(key) ?? new MatchSync(target.puuid, target.queueId);
    if (!sync.canStart(this.now)) {
      const retry = sync.retryAvailableAt;
      return Result.fail(
        new MatchCollectionAdmissionRejectedError({
          code:
            retry && retry > this.now
              ? "RIOT_RETRY_RESTRICTED"
              : "COLLECTION_COOLDOWN",
          retryAvailableAt: new Date(
            Math.max(
              sync.lastSucceededAt
                ? sync.lastSucceededAt.getTime() + 1200000
                : 0,
              retry?.getTime() ?? 0,
            ),
          ),
        }),
      );
    }
    const jobId = `job-${this.jobs.size + 1}`;
    const created = MatchCollectionJob.create({
      ...target,
      jobId,
      requestedAt: this.now,
      maxAttempts,
    });
    if (Result.isFailure(created))
      return Result.fail(this.invalid(created.error));
    Result.unwrap(sync.start(this.now));
    this.jobs.set(jobId, created.value);
    this.syncs.set(key, sync);
    return Result.succeed({ jobId, created: true });
  }

  /** @description 실행 가능한 초기·복구 대기 작업 또는 권한이 만료된 종료 확정 작업을 준비한다. */
  async claimNext(): ReturnType<MatchCollectionExecution["claimNext"]> {
    for (const job of this.jobs.values()) {
      const data = job.snapshot;
      const lease = this.leases.get(data.jobId);
      if (lease && lease.leaseExpiresAt > this.now) continue;
      if (data.status === "FINALIZING")
        return Result.succeed(this.issue(job, "FINALIZE"));
      if (data.status !== "QUEUED" && data.status !== "RETRY_WAIT") continue;
      if (data.nextAttemptAt && data.nextAttemptAt > this.now) continue;
      const started = job.start(this.now);
      if (Result.isFailure(started))
        return Result.fail(this.invalid(started.error));
      return Result.succeed(this.issue(job, "COLLECT"));
    }
    return Result.succeed(null);
  }

  /** @description 저장된 소유권만 갱신하여 호출자가 가진 만료 시각을 신뢰하지 않는다. */
  async renew(
    lease: ExecutionLease,
  ): ReturnType<MatchCollectionExecution["renew"]> {
    if (this.renewError) return Result.fail(this.renewError);
    if (!this.owns(lease))
      return Result.fail(new MatchCollectionLeaseLostError());
    const renewed = {
      ...lease,
      leaseExpiresAt: new Date(this.now.getTime() + 10000),
    };
    this.leases.set(lease.jobId, renewed);
    return Result.succeed(renewed);
  }

  /** @description 실제 Domain의 목록 고정 규칙을 적용한다. */
  async saveSelection(
    lease: ExecutionLease,
    ids: readonly string[],
  ): ReturnType<MatchCollectionProgress["saveSelection"]> {
    if (this.selectionError) return Result.fail(this.selectionError);
    const job = this.collecting(lease);
    if (!job) return Result.fail(new MatchCollectionLeaseLostError());
    const selected = job.selectMatches(ids);
    return Result.isFailure(selected)
      ? Result.fail(this.invalid(selected.error))
      : Result.succeed({ job: job.snapshot, lease });
  }

  /** @description 현재 수집 권한이 있을 때만 신규 경기 캐시를 보관한다. */
  async saveMatches(
    lease: ExecutionLease,
    matches: readonly PlayerMatch[],
  ): ReturnType<MatchCollectionProgress["saveMatches"]> {
    if (this.matchesError) return Result.fail(this.matchesError);
    if (!this.collecting(lease))
      return Result.fail(new MatchCollectionLeaseLostError());
    for (const match of matches) {
      if (
        !this.savedMatches.some(
          (saved) =>
            saved.matchId === match.matchId && saved.puuid === match.puuid,
        )
      )
        this.savedMatches.push(match);
    }
    return Result.succeed(undefined);
  }

  /** @description 복구 예약과 한도 소진 결과를 실제 Domain에 위임한다. */
  async scheduleRetry(
    lease: ExecutionLease,
    failure: MatchCollectionJobFailure,
  ): ReturnType<MatchCollectionExecution["scheduleRetry"]> {
    if (this.retryError) return Result.fail(this.retryError);
    const job = this.collecting(lease);
    if (!job) return Result.fail(new MatchCollectionLeaseLostError());
    const scheduled = job.scheduleRetry(
      failure,
      new Date(this.now.getTime() + 5000),
      this.now,
    );
    if (Result.isFailure(scheduled))
      return Result.fail(this.invalid(scheduled.error));
    this.leases.delete(lease.jobId);
    return Result.succeed(
      job.snapshot.status === "FINALIZING" ? this.issue(job, "FINALIZE") : null,
    );
  }

  /** @description 결과 기록 후 새 토큰을 발급하고 필요하면 커밋 응답 유실을 재현한다. */
  async recordOutcome(
    lease: ExecutionLease,
    outcome: MatchCollectionJobOutcome,
  ): ReturnType<MatchCollectionCompletion["recordOutcome"]> {
    if (this.outcomeError) return Result.fail(this.outcomeError);
    const job = this.collecting(lease);
    if (!job) return Result.fail(new MatchCollectionLeaseLostError());
    const recorded = job.recordOutcome(outcome, this.now);
    if (Result.isFailure(recorded))
      return Result.fail(this.invalid(recorded.error));
    const claimed = this.issue(job, "FINALIZE");
    return this.outcomeCommitError
      ? Result.fail(this.outcomeCommitError)
      : Result.succeed(claimed);
  }

  /** @description 기록된 결과만으로 실제 작업·MatchSync를 종료한다. 원자성 자체는 DB 통합 테스트의 대상이다. */
  async finish(
    lease: ExecutionLease,
  ): ReturnType<MatchCollectionCompletion["finish"]> {
    if (this.finishError) return Result.fail(this.finishError);
    const job = this.jobs.get(lease.jobId);
    if (job?.snapshot.finishedAt) return Result.succeed(undefined);
    if (!job || lease.purpose !== "FINALIZE" || !this.owns(lease))
      return Result.fail(new MatchCollectionLeaseLostError());
    const data = job.snapshot;
    if (!data.outcome) return Result.fail(new MatchCollectionLeaseLostError());
    const sync = this.syncs.get(JSON.stringify([data.puuid, data.queueId]));
    if (!sync) return Result.fail(this.invalid(new Error("수집 상태 없음")));
    const updated =
      data.outcome.status === "FAILED"
        ? sync.fail(data.outcome.failure.retryAvailableAt ?? undefined)
        : data.outcome.status === "PARTIALLY_SUCCEEDED"
          ? sync.partiallySucceed(this.now, data.selectedMatchIds ?? [])
          : sync.succeed(this.now, data.selectedMatchIds ?? []);
    if (Result.isFailure(updated))
      return Result.fail(this.invalid(updated.error));
    Result.unwrap(job.finish(this.now));
    this.leases.delete(lease.jobId);
    return this.finishCommitError
      ? Result.fail(this.finishCommitError)
      : Result.succeed(undefined);
  }

  /** @description 실제 상태와 현재 성공 대기·API 제한을 읽고 내부 상태를 변경하지 않는다. */
  async findById(
    jobId: string,
  ): ReturnType<MatchCollectionJobQuery["findById"]> {
    if (this.readError) return Result.fail(this.readError);
    const job = this.jobs.get(jobId)?.snapshot;
    if (!job) return Result.succeed(null);
    const sync = this.syncs.get(JSON.stringify([job.puuid, job.queueId]));
    const limit = Math.max(
      sync?.lastSucceededAt ? sync.lastSucceededAt.getTime() + 1200000 : 0,
      sync?.retryAvailableAt?.getTime() ?? 0,
    );
    return Result.succeed({
      job,
      retryAvailableAt: limit > this.now.getTime() ? new Date(limit) : null,
    });
  }

  /** @description 저장된 토큰·목적·만료만으로 대역의 현재 권한을 확인한다. */
  private owns(lease: ExecutionLease): boolean {
    const stored = this.leases.get(lease.jobId);
    return (
      stored !== undefined &&
      stored.executionToken === lease.executionToken &&
      stored.purpose === lease.purpose &&
      stored.leaseExpiresAt > this.now
    );
  }

  /** @description 수집 중 상태와 COLLECT 권한을 함께 확인한다. */
  private collecting(lease: ExecutionLease): MatchCollectionJob | null {
    const job = this.jobs.get(lease.jobId);
    return this.owns(lease) &&
      lease.purpose === "COLLECT" &&
      job?.snapshot.status === "RUNNING"
      ? job
      : null;
  }

  /** @description 새 실행 토큰을 발급해 선점·결과 기록 전후의 권한을 분리한다. */
  private issue(
    job: MatchCollectionJob,
    purpose: ExecutionLease["purpose"],
  ): ClaimedMatchCollectionJob {
    const lease: ExecutionLease = {
      jobId: job.snapshot.jobId,
      executionToken: `token-${++this.tokenSequence}`,
      purpose,
      leaseExpiresAt: new Date(this.now.getTime() + 10000),
    };
    this.leases.set(lease.jobId, lease);
    return { job: job.snapshot, lease };
  }

  /** @description 대역 설정의 도메인 계약 위반을 재시도 불가 저장 실패로 드러낸다. */
  private invalid(cause: unknown): MatchCollectionJobPersistenceError {
    return new MatchCollectionJobPersistenceError({ retryable: false, cause });
  }
}
