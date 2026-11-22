import type { MatchCollectionJobData } from "@/backend/match/domain/types/MatchCollectionJobData.type";
import type { StoredMatchCollectionJobFailure } from "./StoredMatchCollectionJobFailure.type";
import type { StoredMatchCollectionJobOutcome } from "./StoredMatchCollectionJobOutcome.type";

/** @description SQL 날짜 열은 Date, JSONB 내부 시각은 ISO 문자열인 작업 저장 계약이다. 실행 권한은 별도로 저장한다. */
export type StoredMatchCollectionJob = Omit<
  MatchCollectionJobData,
  "lastFailure" | "outcome"
> & {
  lastFailure: StoredMatchCollectionJobFailure | null;
  outcome: StoredMatchCollectionJobOutcome | null;
};
