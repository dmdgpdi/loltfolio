import { randomUUID } from "node:crypto";
import { Result } from "@praha/byethrow";
import { and, eq, sql } from "drizzle-orm";
import type { getDatabase } from "@/backend/db/client";
import { MatchCollectionAdmissionRejectedError } from "@/backend/match/application/errors/MatchCollectionAdmissionRejectedError";
import { MatchCollectionJobPersistenceError } from "@/backend/match/application/errors/MatchCollectionJobPersistenceError";
import { MatchCollectionLeaseLostError } from "@/backend/match/application/errors/MatchCollectionLeaseLostError";
import type { MatchCollectionAdmission } from "@/backend/match/application/MatchCollectionAdmission";
import type { MatchCollectionCompletion } from "@/backend/match/application/MatchCollectionCompletion";
import type { MatchCollectionExecution } from "@/backend/match/application/MatchCollectionExecution";
import type { MatchCollectionJobQuery } from "@/backend/match/application/MatchCollectionJobQuery";
import type { MatchCollectionProgress } from "@/backend/match/application/MatchCollectionProgress";
import type { ExecutionLease } from "@/backend/match/application/types/ExecutionLease.type";
import { MATCH_SYNC_SUCCESS_COOLDOWN_MS } from "@/backend/match/domain/MATCH_SYNC_SUCCESS_COOLDOWN_MS";
import { MatchCollectionJob } from "@/backend/match/domain/MatchCollectionJob";
import { MatchSync } from "@/backend/match/domain/MatchSync";
import { matchSyncs, playerMatches } from "./match.schema";
import { matchCollectionJobs as jobs } from "./matchCollectionJobs.schema";
import { restoreMatchCollectionJob } from "./restoreMatchCollectionJob";
import { serializeMatchCollectionJob } from "./serializeMatchCollectionJob";
import { toStoredPlayerMatch } from "./toStoredPlayerMatch";
import type { MatchCollectionStoreOptions } from "./types/MatchCollectionStoreOptions.type";

type Database = ReturnType<typeof getDatabase>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type JobRow = typeof jobs.$inferSelect;
type SyncRow = typeof matchSyncs.$inferSelect;

/** @description 대상 → 작업 순서로 잠그고 DB 시각·실행 토큰으로 수집 작업의 원자적 저장을 보장한다. */
export class DrizzleMatchCollectionJobs
  implements
    MatchCollectionAdmission,
    MatchCollectionExecution,
    MatchCollectionProgress,
    MatchCollectionCompletion,
    MatchCollectionJobQuery
{
  private readonly options: MatchCollectionStoreOptions;

  /** @description 인프라 연결과 양의 정수 밀리초 설정을 받아 운영 숫자를 도메인에서 분리한다. */
  constructor(
    private readonly db: Database,
    options: MatchCollectionStoreOptions,
  ) {
    if (
      ![options.leaseDurationMs, options.retryDelayMs].every(
        (value) =>
          Number.isSafeInteger(value) && value > 0 && value <= 2147483647,
      )
    )
      throw new RangeError(
        "작업 시간 설정은 1~2147483647 밀리초의 정수여야 합니다.",
      );
    this.options = { ...options };
  }

  /** @description 최초 대상 생성부터 활성 작업 공유·접수 제한·작업 연결까지 하나의 대상 잠금 안에서 처리한다. */
  admit: MatchCollectionAdmission["admit"] = (target, maxAttempts) =>
    attempt(
      () =>
        this.db.transaction(async (tx) => {
          await tx
            .insert(matchSyncs)
            .values({ ...target, status: "NOT_STARTED" })
            .onConflictDoNothing();
          const syncRow = await lockTarget(tx, target);
          if (syncRow.activeJobId !== null) {
            const [row] = await tx
              .select()
              .from(jobs)
              .where(eq(jobs.jobId, syncRow.activeJobId))
              .for("update");
            if (
              !row ||
              unwrap(restoreMatchCollectionJob(row)).snapshot.finishedAt !==
                null
            )
              throw new Error("활성 연결 불일치");
            return { jobId: row.jobId, created: false };
          }
          const now = await databaseTime(tx);
          const sync = unwrap(MatchSync.restore(syncRow));
          if (!sync.canStart(now)) rejectAdmission(syncRow, now);
          const job = unwrap(
            MatchCollectionJob.create({
              ...target,
              jobId: randomUUID(),
              maxAttempts,
              requestedAt: now,
            }),
          );
          unwrap(sync.start(now));
          await tx.insert(jobs).values(serializeMatchCollectionJob(job));
          await tx
            .update(matchSyncs)
            .set({
              status: sync.status,
              lastAttemptAt: now,
              activeJobId: job.snapshot.jobId,
            })
            .where(
              and(
                eq(matchSyncs.puuid, target.puuid),
                eq(matchSyncs.queueId, target.queueId),
              ),
            );
          return { jobId: job.snapshot.jobId, created: true };
        }),
      admissionError,
    );

  /** @description 실행 가능한 대상만 SKIP LOCKED로 선점하고 만료 수집은 복구 예약 또는 실패 확정으로 넘긴다. */
  claimNext: MatchCollectionExecution["claimNext"] = () =>
    attempt(
      () =>
        this.db.transaction(async (tx) => {
          const candidate = await claimCandidate(tx);
          if (!candidate) return null;
          const [row] = await tx
            .select()
            .from(jobs)
            .where(eq(jobs.jobId, candidate.jobId))
            .for("update");
          if (!row) throw new Error("작업 없음");
          const now = await databaseTime(tx);
          const job = await prepareClaim(
            tx,
            row,
            now,
            this.options.retryDelayMs,
          );
          if (!job) return null;
          const lease = this.issue(job, now);
          await saveJob(tx, job, lease);
          return { job: job.snapshot, lease };
        }),
      persistenceError,
    );

  /** @description 호출자의 만료 시각 대신 DB 소유권을 검증하고 같은 토큰의 유효기간만 연장한다. */
  renew: MatchCollectionExecution["renew"] = (lease) =>
    this.owned(lease, null, async (tx, job, now, row) => {
      const renewed = {
        ...lease,
        leaseExpiresAt: new Date(
          Math.max(
            row.leaseExpiresAt?.getTime() ?? 0,
            now.getTime() + this.options.leaseDurationMs,
          ),
        ),
      };
      await saveJob(tx, job, renewed);
      return renewed;
    });

  /** @description 최초 선택 목록을 고정하고 기존 실행 권한을 유지한다. */
  saveSelection: MatchCollectionProgress["saveSelection"] = (lease, ids) =>
    this.owned(lease, "COLLECT", async (tx, job, _now, row) => {
      unwrap(job.selectMatches(ids));
      const current = rowLease(row);
      await saveJob(tx, job, current);
      return { job: job.snapshot, lease: current };
    });

  /** @description 선택한 대상·경기만 같은 권한 트랜잭션에서 저장하며 기존 캐시는 덮어쓰지 않는다. */
  saveMatches: MatchCollectionProgress["saveMatches"] = (lease, matches) =>
    this.owned(lease, "COLLECT", async (tx, job) => {
      const data = job.snapshot;
      if (
        data.selectedMatchIds === null ||
        matches.some(
          (match) =>
            match.puuid !== data.puuid ||
            match.queueId !== data.queueId ||
            !data.selectedMatchIds?.includes(match.matchId),
        )
      )
        throw new Error("작업 대상·선택 목록 밖의 경기");
      if (matches.length > 0)
        await tx
          .insert(playerMatches)
          .values(matches.map(toStoredPlayerMatch))
          .onConflictDoNothing({
            target: [playerMatches.matchId, playerMatches.puuid],
          });
    });

  /** @description 일시적 장애는 권한 해제와 함께 예약하고 한도 소진이면 새 종료 확정 권한을 발급한다. */
  scheduleRetry: MatchCollectionExecution["scheduleRetry"] = (lease, failure) =>
    this.owned(lease, "COLLECT", async (tx, job, now) => {
      unwrap(
        job.scheduleRetry(
          failure,
          new Date(now.getTime() + this.options.retryDelayMs),
          now,
        ),
      );
      const finalLease =
        job.snapshot.status === "FINALIZING" ? this.issue(job, now) : null;
      await saveJob(tx, job, finalLease);
      return finalLease === null
        ? null
        : { job: job.snapshot, lease: finalLease };
    });

  /** @description 결과 기록과 목적·토큰 교체를 함께 커밋해 기록된 429가 다시 수집되지 않게 한다. */
  recordOutcome: MatchCollectionCompletion["recordOutcome"] = (
    lease,
    outcome,
  ) =>
    this.owned(lease, "COLLECT", async (tx, job, now) => {
      unwrap(job.recordOutcome(outcome, now));
      const finalLease = this.issue(job, now);
      await saveJob(tx, job, finalLease);
      return { job: job.snapshot, lease: finalLease };
    });

  /** @description 저장된 결과로 작업·표본·제한·활성 연결을 함께 확정하며 이미 끝난 작업은 성공으로 재확인한다. */
  finish: MatchCollectionCompletion["finish"] = (lease) =>
    attempt(
      () =>
        this.db.transaction(async (tx) => {
          const { row, syncRow } = await lockJob(tx, lease.jobId);
          if (row.finishedAt !== null) {
            unwrap(restoreMatchCollectionJob(row));
            return;
          }
          const now = await databaseTime(tx);
          assertOwnership({
            row,
            sync: syncRow,
            lease,
            purpose: "FINALIZE",
            now,
          });
          const job = unwrap(restoreMatchCollectionJob(row));
          const sync = unwrap(MatchSync.restore(syncRow));
          const data = job.snapshot;
          completeSync(sync, job, now);
          unwrap(job.finish(now));
          await saveJob(tx, job, null);
          await tx
            .update(matchSyncs)
            .set({
              status: sync.status,
              lastSucceededAt: sync.lastSucceededAt,
              lastCompletedMatchIds: sync.lastCompletedMatchIds,
              retryAvailableAt: sync.retryAvailableAt,
              activeJobId: null,
            })
            .where(
              and(
                eq(matchSyncs.puuid, data.puuid),
                eq(matchSyncs.queueId, data.queueId),
              ),
            );
          await assertUnexpired(tx, row);
        }),
      writeError,
    );

  /** @description 단일 조회 스냅샷에서 현재 대상의 접수 제한과 작업을 읽으며 상태를 변경하지 않는다. */
  findById: MatchCollectionJobQuery["findById"] = (jobId) =>
    attempt(async () => {
      const [record] = await this.db
        .select({
          job: jobs,
          sync: matchSyncs,
          now: sql<string>`date_trunc('milliseconds', clock_timestamp())`.mapWith(
            databaseDate,
          ),
        })
        .from(jobs)
        .innerJoin(
          matchSyncs,
          and(
            eq(jobs.puuid, matchSyncs.puuid),
            eq(jobs.queueId, matchSyncs.queueId),
          ),
        )
        .where(eq(jobs.jobId, jobId));
      if (!record) return null;
      return {
        job: unwrap(restoreMatchCollectionJob(record.job)).snapshot,
        retryAvailableAt: currentLimit(record.sync, record.now),
      };
    }, persistenceError);

  /** @description 대상·작업 잠금과 권한 검증을 공유하고 쓰기 후 만료 여부도 확인하여 실패 시 전체를 롤백한다. */
  private owned<T>(
    lease: ExecutionLease,
    purpose: ExecutionLease["purpose"] | null,
    action: (
      tx: Transaction,
      job: MatchCollectionJob,
      now: Date,
      row: JobRow,
    ) => Promise<T>,
  ) {
    return attempt(
      () =>
        this.db.transaction(async (tx) => {
          const { row, syncRow } = await lockJob(tx, lease.jobId);
          const now = await databaseTime(tx);
          assertOwnership({ row, sync: syncRow, lease, purpose, now });
          const result = await action(
            tx,
            unwrap(restoreMatchCollectionJob(row)),
            now,
            row,
          );
          await assertUnexpired(tx, row);
          return result;
        }),
      writeError,
    );
  }

  /** @description 선점과 목적 변경마다 새 토큰을 발급한다. */
  private issue(job: MatchCollectionJob, now: Date): ExecutionLease {
    return {
      jobId: job.snapshot.jobId,
      executionToken: randomUUID(),
      purpose: job.snapshot.status === "FINALIZING" ? "FINALIZE" : "COLLECT",
      leaseExpiresAt: new Date(now.getTime() + this.options.leaseDurationMs),
    };
  }
}

/** @description 작업 ID로 대상을 찾은 뒤 대상 → 작업 순서로 잠가 선점·완료 간 교착을 방지한다. */
async function lockJob(tx: Transaction, jobId: string) {
  const [header] = await tx
    .select({ puuid: jobs.puuid, queueId: jobs.queueId })
    .from(jobs)
    .where(eq(jobs.jobId, jobId));
  if (!header) throw new MatchCollectionLeaseLostError();
  const [syncRow] = await tx
    .select()
    .from(matchSyncs)
    .where(
      and(
        eq(matchSyncs.puuid, header.puuid),
        eq(matchSyncs.queueId, header.queueId),
      ),
    )
    .for("update");
  const [row] = await tx
    .select()
    .from(jobs)
    .where(eq(jobs.jobId, jobId))
    .for("update");
  if (!(row && syncRow)) throw new MatchCollectionLeaseLostError();
  return { row, syncRow };
}

/** @description 애플리케이션과 정밀도를 맞추되 트랜잭션 시작 시각이 아닌 잠금 획득 후 DB 시각을 사용한다. */
async function databaseTime(tx: Transaction): Promise<Date> {
  const result = await tx.execute<{ now: string }>(
    sql`SELECT date_trunc('milliseconds', clock_timestamp()) AS now`,
  );
  return databaseDate(result.rows[0].now);
}

/** @description 잠금으로 보호된 저장 토큰·목적·상태·대상 연결·만료를 함께 검사한다. */
function assertOwnership({
  row,
  sync,
  lease,
  purpose,
  now,
}: {
  row: JobRow;
  sync: SyncRow;
  lease: ExecutionLease;
  purpose: ExecutionLease["purpose"] | null;
  now: Date;
}) {
  if (
    sync.activeJobId !== row.jobId ||
    sync.status !== "IN_PROGRESS" ||
    row.executionToken !== lease.executionToken ||
    row.executionPurpose !== lease.purpose ||
    (purpose !== null && purpose !== lease.purpose) ||
    row.status !== (lease.purpose === "COLLECT" ? "RUNNING" : "FINALIZING") ||
    row.leaseExpiresAt === null ||
    row.leaseExpiresAt <= now
  )
    throw new MatchCollectionLeaseLostError();
}

/** @description 경기 저장이나 완료 SQL 실행 중 권한이 만료되었으면 커밋하지 않는다. */
async function assertUnexpired(tx: Transaction, row: JobRow) {
  if (
    row.leaseExpiresAt === null ||
    row.leaseExpiresAt <= (await databaseTime(tx))
  )
    throw new MatchCollectionLeaseLostError();
}

/** @description 도메인 기록과 실행 권한을 하나의 행 갱신으로 저장한다. */
async function saveJob(
  tx: Transaction,
  job: MatchCollectionJob,
  lease: ExecutionLease | null,
) {
  await tx
    .update(jobs)
    .set({
      ...serializeMatchCollectionJob(job),
      executionToken: lease?.executionToken ?? null,
      executionPurpose: lease?.purpose ?? null,
      leaseExpiresAt: lease?.leaseExpiresAt ?? null,
    })
    .where(eq(jobs.jobId, job.snapshot.jobId));
}

/** @description DB에서 검증된 실행 권한을 반환하며 호출자 제공 만료 시각을 재사용하지 않는다. */
function rowLease(row: JobRow): ExecutionLease {
  if (!(row.executionToken && row.executionPurpose && row.leaseExpiresAt))
    throw new MatchCollectionLeaseLostError();
  return {
    jobId: row.jobId,
    executionToken: row.executionToken,
    purpose: row.executionPurpose,
    leaseExpiresAt: row.leaseExpiresAt,
  };
}

/** @description 현재 대상의 성공 대기·API 제한 중 아직 유효한 가장 늦은 시각을 반환한다. */
function currentLimit(row: SyncRow, now: Date): Date | null {
  const limit = Math.max(
    row.lastSucceededAt
      ? row.lastSucceededAt.getTime() + MATCH_SYNC_SUCCESS_COOLDOWN_MS
      : 0,
    row.retryAvailableAt?.getTime() ?? 0,
  );
  return limit > now.getTime() ? new Date(limit) : null;
}

/** @description 복구 불가능한 구형 진행 기록은 추정해 덮어쓰지 않으며 일반 접수 제한과 구분한다. */
function rejectAdmission(row: SyncRow, now: Date): never {
  const limit = currentLimit(row, now);
  if (!limit) throw new Error("활성 작업 연결 없는 진행 상태");
  throw new MatchCollectionAdmissionRejectedError({
    code:
      row.retryAvailableAt && row.retryAvailableAt > now
        ? "RIOT_RETRY_RESTRICTED"
        : "COLLECTION_COOLDOWN",
    retryAvailableAt: limit,
  });
}

/** @description 도메인 실패는 예외로 트랜잭션을 롤백한 뒤 포트 오류로 변환한다. */
function unwrap<T, E>(result: Result.Result<T, E>): T {
  if (Result.isFailure(result)) throw result.error;
  return result.value;
}

/** @description 커밋까지 성공한 값만 반환하고 예외 발생 시 담당 포트의 오류로 변환한다. */
async function attempt<T, E>(
  action: () => Promise<T>,
  error: (cause: unknown) => E,
): Promise<Result.Result<T, E>> {
  try {
    return Result.succeed(await action());
  } catch (cause) {
    return Result.fail(error(cause));
  }
}

/** @description 실행 권한 상실은 저장 장애와 구분한다. */
function writeError(cause: unknown) {
  return cause instanceof MatchCollectionLeaseLostError
    ? cause
    : persistenceError(cause);
}
/** @description 접수 제한은 작업 저장 실패와 구분한다. */
function admissionError(cause: unknown) {
  return cause instanceof MatchCollectionAdmissionRejectedError
    ? cause
    : persistenceError(cause);
}
/** @description 명시적으로 분류 가능한 PostgreSQL·연결 일시 오류만 재시도 가능으로 표시한다. */
function persistenceError(cause: unknown): MatchCollectionJobPersistenceError {
  return new MatchCollectionJobPersistenceError({
    cause,
    retryable: transient(cause),
  });
}
/** @description Drizzle이 감싼 원인에서 알려진 SQLSTATE·연결 오류를 찾고 미분류 오류는 재시도하지 않는다. */
function transient(cause: unknown, depth = 0): boolean {
  if (!cause || typeof cause !== "object" || depth > 5) return false;
  if (
    "code" in cause &&
    typeof cause.code === "string" &&
    [
      "40001",
      "40P01",
      "53300",
      "57P01",
      "57P02",
      "57P03",
      "08000",
      "08001",
      "08003",
      "08006",
      "08007",
      "08P01",
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "EPIPE",
    ].includes(cause.code)
  )
    return true;
  return "cause" in cause && transient(cause.cause, depth + 1);
}

/** @description 드라이버의 원시 SQL 날짜 문자열을 유효한 Date로 변환한다. */
function databaseDate(value: string | Date): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("DB 시각 형식 오류");
  return date;
}

/** @description 같은 대상을 다루는 접수·실행 경로의 잠금 순서를 통일한다. */
async function lockTarget(
  tx: Transaction,
  target: Pick<SyncRow, "puuid" | "queueId">,
) {
  const [row] = await tx
    .select()
    .from(matchSyncs)
    .where(
      and(
        eq(matchSyncs.puuid, target.puuid),
        eq(matchSyncs.queueId, target.queueId),
      ),
    )
    .for("update");
  if (!row) throw new Error("대상 기록 없음");
  return row;
}

/** @description 다른 워커가 잠근 대상은 기다리지 않고 다음 실행 가능한 대상을 고른다. */
async function claimCandidate(tx: Transaction) {
  const [candidate] = await tx
    .select({ jobId: jobs.jobId })
    .from(matchSyncs)
    .innerJoin(
      jobs,
      and(
        eq(matchSyncs.activeJobId, jobs.jobId),
        eq(matchSyncs.puuid, jobs.puuid),
        eq(matchSyncs.queueId, jobs.queueId),
      ),
    )
    .where(
      sql`${jobs.status} = 'QUEUED' OR (${jobs.status} = 'RETRY_WAIT' AND ${jobs.nextAttemptAt} <= clock_timestamp()) OR (${jobs.status} IN ('RUNNING', 'FINALIZING') AND ${jobs.leaseExpiresAt} <= clock_timestamp())`,
    )
    .orderBy(jobs.requestedAt, jobs.jobId)
    .limit(1)
    .for("update", { of: matchSyncs, skipLocked: true });
  return candidate;
}

/** @description 저장된 상태에 따라 수집 시작·만료 복구·종료 재개를 구분한다. */
async function prepareClaim(
  tx: Transaction,
  row: JobRow,
  now: Date,
  retryDelayMs: number,
) {
  const job = unwrap(restoreMatchCollectionJob(row));
  if (row.status === "RUNNING") {
    if (row.leaseExpiresAt === null || row.leaseExpiresAt > now) return null;
    unwrap(
      job.scheduleRetry(
        { code: "WORKER_INTERRUPTED", retryAvailableAt: null },
        new Date(now.getTime() + retryDelayMs),
        now,
      ),
    );
    if (job.snapshot.status === "RETRY_WAIT") {
      await saveJob(tx, job, null);
      return null;
    }
    return job;
  }
  if (row.status === "FINALIZING")
    return row.leaseExpiresAt !== null && row.leaseExpiresAt <= now
      ? job
      : null;
  if (row.status !== "QUEUED" && row.status !== "RETRY_WAIT") return null;
  if (row.nextAttemptAt !== null && row.nextAttemptAt > now) return null;
  unwrap(job.start(now));
  return job;
}

/** @description 최종 결과만 MatchSync에 반영하고 실패한 최신화에서는 과거 표본과 성공 시각을 보존한다. */
function completeSync(sync: MatchSync, job: MatchCollectionJob, now: Date) {
  const data = job.snapshot;
  if (!data.outcome) throw new Error("확정 결과 없음");
  if (data.outcome.status === "FAILED")
    unwrap(sync.fail(data.outcome.failure.retryAvailableAt ?? undefined));
  else if (data.outcome.status === "PARTIALLY_SUCCEEDED")
    unwrap(sync.partiallySucceed(now, data.selectedMatchIds ?? []));
  else unwrap(sync.succeed(now, data.selectedMatchIds ?? []));
}
