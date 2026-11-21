import type { Result } from "@praha/byethrow";
import type { InvalidMatchCollectionCommandError } from "./errors/InvalidMatchCollectionCommandError";
import type { MatchCollectionJobPersistenceError } from "./errors/MatchCollectionJobPersistenceError";
import type { MatchCollectionJobDto } from "./types/MatchCollectionJobDto.type";
/** @description HTTP와 독립적인 공개 작업 상태 조회 계약이다. */
export interface MatchCollectionJobReader {
  /** @description 내부 기록을 공개 상태 DTO로 반환하며 작업 부재는 null이다. */
  findById(
    jobId: string,
  ): Promise<
    Result.Result<
      MatchCollectionJobDto | null,
      InvalidMatchCollectionCommandError | MatchCollectionJobPersistenceError
    >
  >;
}
