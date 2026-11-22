import { Result } from "@praha/byethrow";
import { z } from "zod";
import { InvalidMatchCollectionJobError } from "@/backend/match/domain/errors/InvalidMatchCollectionJobError";
import { MatchCollectionJob } from "@/backend/match/domain/MatchCollectionJob";
import type { MatchCollectionJobData } from "@/backend/match/domain/types/MatchCollectionJobData.type";

const failure = z.object({
  code: z.enum([
    "WORKER_INTERRUPTED",
    "TEMPORARY_FAILURE",
    "RIOT_RATE_LIMITED",
    "AUTHENTICATION_FAILED",
    "CONFIGURATION_ERROR",
    "INVALID_RESPONSE",
    "COLLECTION_FAILED",
    "ATTEMPTS_EXHAUSTED",
  ]),
  retryAvailableAt: z.iso
    .datetime()
    .transform((value) => new Date(value))
    .nullable(),
});
const record = z.object({
  jobId: z.string(),
  puuid: z.string(),
  queueId: z.union([
    z.literal(400),
    z.literal(420),
    z.literal(430),
    z.literal(440),
    z.literal(450),
    z.literal(480),
    z.literal(490),
    z.literal(700),
    z.literal(720),
  ]),
  maxAttempts: z.number(),
  attemptCount: z.number(),
  status: z.enum([
    "QUEUED",
    "RUNNING",
    "RETRY_WAIT",
    "FINALIZING",
    "SUCCEEDED",
    "PARTIALLY_SUCCEEDED",
    "FAILED",
  ]),
  requestedAt: z.date(),
  updatedAt: z.date(),
  startedAt: z.date().nullable(),
  finishedAt: z.date().nullable(),
  nextAttemptAt: z.date().nullable(),
  selectedMatchIds: z.array(z.string()).nullable(),
  lastFailure: failure.nullable(),
  outcome: z
    .union([
      z.object({ status: z.enum(["SUCCEEDED", "PARTIALLY_SUCCEEDED"]) }),
      z.object({ status: z.literal("FAILED"), failure }),
    ])
    .nullable(),
});

/** @description DB 행과 JSONB 시각을 검증한 후 도메인 불변 조건으로 복원한다. 손상된 기록을 기본값으로 보정하지 않는다. */
export function restoreMatchCollectionJob(
  input: unknown,
): Result.Result<MatchCollectionJob, InvalidMatchCollectionJobError> {
  const parsed = record.safeParse(input);
  if (!parsed.success) return Result.fail(new InvalidMatchCollectionJobError());
  const data: MatchCollectionJobData = parsed.data;
  return MatchCollectionJob.restore(data);
}
