import type { Result } from "@praha/byethrow";
import type { PlayerMatch } from "@/backend/match/domain/PlayerMatch";
import type { ClaimedMatchCollectionJob } from "./types/ClaimedMatchCollectionJob.type";
import type { ExecutionLease } from "./types/ExecutionLease.type";
import type { MatchCollectionJobWriteError } from "./types/MatchCollectionJobWriteError.type";
/** @description COLLECT 권한 검증과 목록·경기 저장을 같은 쓰기 경계에서 수행한다. */
export interface MatchCollectionProgress {
  /** @description 최초 목록을 Domain 규칙으로 고정하고 저장된 목록과 현재 권한을 반환한다. */
  saveSelection(
    lease: ExecutionLease,
    ids: readonly string[],
  ): Promise<
    Result.Result<ClaimedMatchCollectionJob, MatchCollectionJobWriteError>
  >;
  /** @description 대상·목록 범위의 경기만 저장하며 기존 경기와 이전 완료 표본은 교체하지 않는다. */
  saveMatches(
    lease: ExecutionLease,
    matches: readonly PlayerMatch[],
  ): Promise<Result.Result<void, MatchCollectionJobWriteError>>;
}
