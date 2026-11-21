import type { Result } from "@praha/byethrow";
import type { MatchCollectionJobFailure } from "@/backend/match/domain/types/MatchCollectionJobFailure.type";
import type { MatchCollectionJobPersistenceError } from "./errors/MatchCollectionJobPersistenceError";
import type { ClaimedMatchCollectionJob } from "./types/ClaimedMatchCollectionJob.type";
import type { ExecutionLease } from "./types/ExecutionLease.type";
import type { MatchCollectionJobWriteError } from "./types/MatchCollectionJobWriteError.type";
/** @description DB 시각에 따른 선점·갱신·복구 예약을 담당한다. 유효기간·재시도 지연은 구현체에 주입한다. */
export interface MatchCollectionExecution {
  /** @description 만료 작업·기한이 지난 복구 대기·종료 확정을 처리하고 목적에 맞는 권한을 원자적으로 발급한다. */
  claimNext(): Promise<
    Result.Result<
      ClaimedMatchCollectionJob | null,
      MatchCollectionJobPersistenceError
    >
  >;
  /** @description 현재 토큰·목적·대상 연결·만료를 확인해 같은 토큰의 권한을 갱신한다. */
  renew(
    lease: ExecutionLease,
  ): Promise<Result.Result<ExecutionLease, MatchCollectionJobWriteError>>;
  /** @description Domain의 복구 규칙을 적용해 예약한다. 한도 소진이면 실패 결과와 FINALIZE 권한을 반환하고 예약 성공은 null이다. */
  scheduleRetry(
    lease: ExecutionLease,
    failure: MatchCollectionJobFailure,
  ): Promise<
    Result.Result<
      ClaimedMatchCollectionJob | null,
      MatchCollectionJobWriteError
    >
  >;
}
