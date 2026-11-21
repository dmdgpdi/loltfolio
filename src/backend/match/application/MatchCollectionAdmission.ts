import type { Result } from "@praha/byethrow";
import type { MatchCollectionAdmissionRejectedError } from "./errors/MatchCollectionAdmissionRejectedError";
import type { MatchCollectionJobPersistenceError } from "./errors/MatchCollectionJobPersistenceError";
import type { MatchCollectionAdmissionResult } from "./types/MatchCollectionAdmissionResult.type";
import type { MatchCollectionTarget } from "./types/MatchCollectionTarget.type";
/** @description 대상별 활성 작업 확인·접수 제한·작업 생성·MatchSync 연결을 하나의 트랜잭션으로 처리하는 포트다. */
export interface MatchCollectionAdmission {
  /** @description 활성 작업을 먼저 공유하고, 없다면 DB 시각으로 제한을 확인해 새 작업을 저장한다. 커밋 확인 후에만 성공한다. */
  admit(
    target: MatchCollectionTarget,
    maxAttempts: number,
  ): Promise<
    Result.Result<
      MatchCollectionAdmissionResult,
      MatchCollectionAdmissionRejectedError | MatchCollectionJobPersistenceError
    >
  >;
}
