import type { Result } from "@praha/byethrow";
import type { MatchCollectionJobOutcome } from "@/backend/match/domain/types/MatchCollectionJobOutcome.type";
import type { ClaimedMatchCollectionJob } from "./types/ClaimedMatchCollectionJob.type";
import type { ExecutionLease } from "./types/ExecutionLease.type";
import type { MatchCollectionJobWriteError } from "./types/MatchCollectionJobWriteError.type";
/** @description 수집 결과 기록과 작업·MatchSync·완료 표본의 원자적 확정을 구분한다. */
export interface MatchCollectionCompletion {
  /** @description 결과 고정·FINALIZING 전이·새 FINALIZE 토큰 발급을 원자적으로 처리한다. 응답 유실 시 재확인하며 같은 기록은 중복 적용하지 않는다. */
  recordOutcome(
    lease: ExecutionLease,
    outcome: MatchCollectionJobOutcome,
  ): Promise<
    Result.Result<ClaimedMatchCollectionJob, MatchCollectionJobWriteError>
  >;
  /** @description 저장된 결과만으로 작업·MatchSync·완료 표본·제한·활성 연결을 함께 확정한다. 이미 종료된 같은 작업은 성공으로 확인한다. */
  finish(
    lease: ExecutionLease,
  ): Promise<Result.Result<void, MatchCollectionJobWriteError>>;
}
