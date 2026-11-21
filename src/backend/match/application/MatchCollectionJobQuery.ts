import type { Result } from "@praha/byethrow";
import type { MatchCollectionJobPersistenceError } from "./errors/MatchCollectionJobPersistenceError";
import type { MatchCollectionJobReadRecord } from "./types/MatchCollectionJobReadRecord.type";
/** @description 작업 상태와 현재 접수 제한만 읽는다. 선점·복구·완료 확정 등의 쓰기를 하지 않는다. */
export interface MatchCollectionJobQuery {
  /** @description 없는 작업은 null이며 조회 실패와 구분한다. 접수 제한 시각은 DB 시간 기준으로 판단한다. */
  findById(
    jobId: string,
  ): Promise<
    Result.Result<
      MatchCollectionJobReadRecord | null,
      MatchCollectionJobPersistenceError
    >
  >;
}
