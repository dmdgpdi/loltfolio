import type { MatchCollectionJob } from "@/backend/match/domain/MatchCollectionJob";
import type { MatchCollectionJobFailure } from "@/backend/match/domain/types/MatchCollectionJobFailure.type";
import type { StoredMatchCollectionJob } from "./types/StoredMatchCollectionJob.type";

/** @description 격리된 스냅샷의 JSONB 내부 Date를 ISO 문자열로 변환한다. */
export function serializeMatchCollectionJob(
  job: MatchCollectionJob,
): StoredMatchCollectionJob {
  const data = job.snapshot;
  return {
    ...data,
    lastFailure:
      data.lastFailure === null ? null : serializeFailure(data.lastFailure),
    outcome:
      data.outcome?.status === "FAILED"
        ? { status: "FAILED", failure: serializeFailure(data.outcome.failure) }
        : data.outcome,
  };
}

/** @description JSONB가 Date 객체를 복원해 준다고 가정하지 않도록 시각 표현을 명시한다. */
function serializeFailure(failure: MatchCollectionJobFailure) {
  return {
    code: failure.code,
    retryAvailableAt: failure.retryAvailableAt?.toISOString() ?? null,
  };
}
