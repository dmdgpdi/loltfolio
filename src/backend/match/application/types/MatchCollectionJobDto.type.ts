import type { MatchCollectionJobFailure } from "@/backend/match/domain/types/MatchCollectionJobFailure.type";
import type { MatchCollectionJobStatus } from "@/backend/match/domain/types/MatchCollectionJobStatus.type";
import type { MatchCollectionTarget } from "./MatchCollectionTarget.type";
/** @description 내부 실행 상태·토큰·원본 오류를 숨긴 작업 조회 데이터다. 시각은 ISO 문자열로 반환한다. */
export type MatchCollectionJobDto = Readonly<{
  jobId: string;
  target: MatchCollectionTarget;
  status: Exclude<MatchCollectionJobStatus, "RETRY_WAIT" | "FINALIZING">;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  failure: Readonly<{
    code: MatchCollectionJobFailure["code"];
    message: string;
  }> | null;
  retryAvailableAt: string | null;
}>;
