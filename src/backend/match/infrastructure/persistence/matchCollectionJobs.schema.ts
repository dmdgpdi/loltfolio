import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { MatchCollectionJobStatus } from "@/backend/match/domain/types/MatchCollectionJobStatus.type";
import type { QueueId } from "@/backend/match/domain/types/QueueId.type";
import type { StoredMatchCollectionJobFailure } from "./types/StoredMatchCollectionJobFailure.type";
import type { StoredMatchCollectionJobOutcome } from "./types/StoredMatchCollectionJobOutcome.type";

/** @description 작업 복구 기록과 실행 권한을 보관한다. 활성 대상의 유일성은 접수 트랜잭션과 별도로 DB에서도 보장한다. */
export const matchCollectionJobs = pgTable(
  "match_collection_jobs",
  {
    jobId: text("job_id").primaryKey(),
    puuid: text("puuid").notNull(),
    queueId: integer("queue_id").$type<QueueId>().notNull(),
    status: text("status").$type<MatchCollectionJobStatus>().notNull(),
    maxAttempts: bigint("max_attempts", { mode: "number" }).notNull(),
    attemptCount: bigint("attempt_count", { mode: "number" }).notNull(),
    requestedAt: timestamp("requested_at", {
      withTimezone: true,
      precision: 3,
    }).notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      precision: 3,
    }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, precision: 3 }),
    finishedAt: timestamp("finished_at", { withTimezone: true, precision: 3 }),
    nextAttemptAt: timestamp("next_attempt_at", {
      withTimezone: true,
      precision: 3,
    }),
    selectedMatchIds: jsonb("selected_match_ids").$type<readonly string[]>(),
    lastFailure: jsonb("last_failure").$type<StoredMatchCollectionJobFailure>(),
    outcome: jsonb("outcome").$type<StoredMatchCollectionJobOutcome>(),
    executionToken: text("execution_token"),
    executionPurpose: text("execution_purpose").$type<"COLLECT" | "FINALIZE">(),
    leaseExpiresAt: timestamp("lease_expires_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (t) => [
    unique("match_collection_jobs_target_job_unique").on(
      t.puuid,
      t.queueId,
      t.jobId,
    ),
    uniqueIndex("match_collection_jobs_active_target_unique")
      .on(t.puuid, t.queueId)
      .where(
        sql`${t.status} IN ('QUEUED', 'RUNNING', 'RETRY_WAIT', 'FINALIZING')`,
      ),
    index("match_collection_jobs_queued_idx")
      .on(t.requestedAt)
      .where(sql`${t.status} = 'QUEUED'`),
    index("match_collection_jobs_retry_idx")
      .on(t.nextAttemptAt)
      .where(sql`${t.status} = 'RETRY_WAIT'`),
    index("match_collection_jobs_lease_idx")
      .on(t.leaseExpiresAt)
      .where(sql`${t.status} IN ('RUNNING', 'FINALIZING')`),
    check(
      "match_collection_jobs_identity_check",
      sql`${t.jobId} <> '' AND ${t.jobId} = btrim(${t.jobId}) AND ${t.puuid} <> '' AND ${t.puuid} = btrim(${t.puuid}) AND ${t.queueId} IN (400, 420, 430, 440, 450, 480, 490, 700, 720)`,
    ),
    check(
      "match_collection_jobs_attempts_check",
      sql`${t.maxAttempts} BETWEEN 1 AND 9007199254740991 AND ${t.attemptCount} BETWEEN 0 AND ${t.maxAttempts}`,
    ),
    check(
      "match_collection_jobs_time_check",
      sql`${t.updatedAt} >= ${t.requestedAt} AND (${t.startedAt} IS NULL OR ${t.startedAt} BETWEEN ${t.requestedAt} AND ${t.updatedAt})`,
    ),
    check(
      "match_collection_jobs_selection_check",
      sql`${t.selectedMatchIds} IS NULL OR CASE WHEN jsonb_typeof(${t.selectedMatchIds}) = 'array' THEN jsonb_array_length(${t.selectedMatchIds}) <= 20 ELSE false END`,
    ),
    check(
      "match_collection_jobs_state_check",
      sql`
    (${t.status} = 'QUEUED' AND ${t.attemptCount} = 0 AND ${t.startedAt} IS NULL AND ${t.finishedAt} IS NULL AND ${t.nextAttemptAt} IS NULL AND ${t.outcome} IS NULL AND ${t.selectedMatchIds} IS NULL AND ${t.lastFailure} IS NULL AND ${t.updatedAt} = ${t.requestedAt}) OR
    (${t.status} = 'RUNNING' AND ${t.attemptCount} > 0 AND ${t.startedAt} IS NOT NULL AND ${t.finishedAt} IS NULL AND ${t.nextAttemptAt} IS NULL AND ${t.outcome} IS NULL) OR
    (${t.status} = 'RETRY_WAIT' AND ${t.attemptCount} > 0 AND ${t.attemptCount} < ${t.maxAttempts} AND ${t.startedAt} IS NOT NULL AND ${t.finishedAt} IS NULL AND ${t.nextAttemptAt} IS NOT NULL AND ${t.nextAttemptAt} >= ${t.updatedAt} AND ${t.lastFailure} IS NOT NULL AND ${t.outcome} IS NULL) OR
    (${t.status} IN ('FINALIZING', 'SUCCEEDED', 'PARTIALLY_SUCCEEDED', 'FAILED') AND ${t.attemptCount} > 0 AND ${t.startedAt} IS NOT NULL AND ${t.nextAttemptAt} IS NULL AND ${t.outcome} IS NOT NULL AND
      CASE WHEN ${t.status} = 'FINALIZING' THEN ${t.finishedAt} IS NULL ELSE ${t.finishedAt} IS NOT NULL AND ${t.finishedAt} = ${t.updatedAt} AND (${t.outcome}->>'status') IS NOT DISTINCT FROM ${t.status} END)
  `,
    ),
    check(
      "match_collection_jobs_lease_check",
      sql`
    CASE WHEN ${t.status} IN ('RUNNING', 'FINALIZING') THEN
      ${t.executionToken} IS NOT NULL AND length(btrim(${t.executionToken})) > 0 AND ${t.leaseExpiresAt} IS NOT NULL AND ${t.executionPurpose} IS NOT DISTINCT FROM CASE WHEN ${t.status} = 'RUNNING' THEN 'COLLECT' ELSE 'FINALIZE' END
    ELSE ${t.executionToken} IS NULL AND ${t.executionPurpose} IS NULL AND ${t.leaseExpiresAt} IS NULL END
  `,
    ),
  ],
);
