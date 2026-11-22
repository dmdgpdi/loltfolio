CREATE TABLE "match_collection_jobs" (
	"job_id" text PRIMARY KEY,
	"puuid" text NOT NULL,
	"queue_id" integer NOT NULL,
	"status" text NOT NULL,
	"max_attempts" bigint NOT NULL,
	"attempt_count" bigint NOT NULL,
	"requested_at" timestamp(3) with time zone NOT NULL,
	"updated_at" timestamp(3) with time zone NOT NULL,
	"started_at" timestamp(3) with time zone,
	"finished_at" timestamp(3) with time zone,
	"next_attempt_at" timestamp(3) with time zone,
	"selected_match_ids" jsonb,
	"last_failure" jsonb,
	"outcome" jsonb,
	"execution_token" text,
	"execution_purpose" text,
	"lease_expires_at" timestamp(3) with time zone,
	CONSTRAINT "match_collection_jobs_target_job_unique" UNIQUE("puuid","queue_id","job_id"),
	CONSTRAINT "match_collection_jobs_identity_check" CHECK ("job_id" <> '' AND "job_id" = btrim("job_id") AND "puuid" <> '' AND "puuid" = btrim("puuid") AND "queue_id" IN (400, 420, 430, 440, 450, 480, 490, 700, 720)),
	CONSTRAINT "match_collection_jobs_attempts_check" CHECK ("max_attempts" BETWEEN 1 AND 9007199254740991 AND "attempt_count" BETWEEN 0 AND "max_attempts"),
	CONSTRAINT "match_collection_jobs_time_check" CHECK ("updated_at" >= "requested_at" AND ("started_at" IS NULL OR "started_at" BETWEEN "requested_at" AND "updated_at")),
	CONSTRAINT "match_collection_jobs_selection_check" CHECK ("selected_match_ids" IS NULL OR CASE WHEN jsonb_typeof("selected_match_ids") = 'array' THEN jsonb_array_length("selected_match_ids") <= 20 ELSE false END),
	CONSTRAINT "match_collection_jobs_state_check" CHECK (
    ("status" = 'QUEUED' AND "attempt_count" = 0 AND "started_at" IS NULL AND "finished_at" IS NULL AND "next_attempt_at" IS NULL AND "outcome" IS NULL AND "selected_match_ids" IS NULL AND "last_failure" IS NULL AND "updated_at" = "requested_at") OR
    ("status" = 'RUNNING' AND "attempt_count" > 0 AND "started_at" IS NOT NULL AND "finished_at" IS NULL AND "next_attempt_at" IS NULL AND "outcome" IS NULL) OR
    ("status" = 'RETRY_WAIT' AND "attempt_count" > 0 AND "attempt_count" < "max_attempts" AND "started_at" IS NOT NULL AND "finished_at" IS NULL AND "next_attempt_at" IS NOT NULL AND "next_attempt_at" >= "updated_at" AND "last_failure" IS NOT NULL AND "outcome" IS NULL) OR
    ("status" IN ('FINALIZING', 'SUCCEEDED', 'PARTIALLY_SUCCEEDED', 'FAILED') AND "attempt_count" > 0 AND "started_at" IS NOT NULL AND "next_attempt_at" IS NULL AND "outcome" IS NOT NULL AND
      CASE WHEN "status" = 'FINALIZING' THEN "finished_at" IS NULL ELSE "finished_at" IS NOT NULL AND "finished_at" = "updated_at" AND ("outcome"->>'status') IS NOT DISTINCT FROM "status" END)
  ),
	CONSTRAINT "match_collection_jobs_lease_check" CHECK (
    CASE WHEN "status" IN ('RUNNING', 'FINALIZING') THEN
      "execution_token" IS NOT NULL AND length(btrim("execution_token")) > 0 AND "lease_expires_at" IS NOT NULL AND "execution_purpose" IS NOT DISTINCT FROM CASE WHEN "status" = 'RUNNING' THEN 'COLLECT' ELSE 'FINALIZE' END
    ELSE "execution_token" IS NULL AND "execution_purpose" IS NULL AND "lease_expires_at" IS NULL END
  )
);
--> statement-breakpoint
ALTER TABLE "match_syncs" ADD COLUMN "active_job_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "match_collection_jobs_active_target_unique" ON "match_collection_jobs" ("puuid","queue_id") WHERE "status" IN ('QUEUED', 'RUNNING', 'RETRY_WAIT', 'FINALIZING');--> statement-breakpoint
CREATE INDEX "match_collection_jobs_queued_idx" ON "match_collection_jobs" ("requested_at") WHERE "status" = 'QUEUED';--> statement-breakpoint
CREATE INDEX "match_collection_jobs_retry_idx" ON "match_collection_jobs" ("next_attempt_at") WHERE "status" = 'RETRY_WAIT';--> statement-breakpoint
CREATE INDEX "match_collection_jobs_lease_idx" ON "match_collection_jobs" ("lease_expires_at") WHERE "status" IN ('RUNNING', 'FINALIZING');--> statement-breakpoint
ALTER TABLE "match_syncs" ADD CONSTRAINT "match_syncs_active_job_fk" FOREIGN KEY ("puuid","queue_id","active_job_id") REFERENCES "match_collection_jobs"("puuid","queue_id","job_id");--> statement-breakpoint
ALTER TABLE "match_syncs" ADD CONSTRAINT "match_syncs_active_job_status_check" CHECK ("active_job_id" IS NULL OR "status" = 'IN_PROGRESS');