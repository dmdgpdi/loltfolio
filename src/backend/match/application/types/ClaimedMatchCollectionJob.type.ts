import type { MatchCollectionJobData } from "@/backend/match/domain/types/MatchCollectionJobData.type";
import type { ExecutionLease } from "./ExecutionLease.type";
/** @description 선점·목록 확정·결과 기록 후 DB에서 읽은 작업과 현재 실행 권한의 일관된 쌍이다. */
export type ClaimedMatchCollectionJob = Readonly<{
  job: MatchCollectionJobData;
  lease: ExecutionLease;
}>;
