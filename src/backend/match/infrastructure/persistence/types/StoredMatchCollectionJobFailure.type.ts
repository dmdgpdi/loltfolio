import type { MatchCollectionJobFailure } from "@/backend/match/domain/types/MatchCollectionJobFailure.type";

/** @description JSONB에서는 실패의 재시도 시각을 ISO 문자열로 보관한다. */
export type StoredMatchCollectionJobFailure = Readonly<{
  code: MatchCollectionJobFailure["code"];
  retryAvailableAt: string | null;
}>;
