import { ErrorFactory } from "@praha/error-factory";
/** @description 저장·조회 실패의 원인과 일시적 장애 여부를 보존한다. 권한 상실과 구분한다. */
export class MatchCollectionJobPersistenceError extends ErrorFactory({
  name: "MatchCollectionJobPersistenceError",
  message: "수집 작업 기록에 접근할 수 없습니다.",
  fields: ErrorFactory.fields<{ retryable: boolean }>(),
}) {}
