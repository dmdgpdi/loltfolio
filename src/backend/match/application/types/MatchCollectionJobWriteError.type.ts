import type { MatchCollectionJobPersistenceError } from "@/backend/match/application/errors/MatchCollectionJobPersistenceError";
import type { MatchCollectionLeaseLostError } from "@/backend/match/application/errors/MatchCollectionLeaseLostError";
/** @description 원자적 쓰기의 저장 장애와 실행 권한 상실을 구분한다. */
export type MatchCollectionJobWriteError =
  | MatchCollectionJobPersistenceError
  | MatchCollectionLeaseLostError;
