import type { MatchCollectionJobData } from "@/backend/match/domain/types/MatchCollectionJobData.type";
/** @description 작업과 해당 대상의 현재 접수 제한을 같은 조회 경계에서 읽은 기록이다. 시각 판정은 DB 기준이다. */
export type MatchCollectionJobReadRecord = Readonly<{
  job: MatchCollectionJobData;
  retryAvailableAt: Date | null;
}>;
