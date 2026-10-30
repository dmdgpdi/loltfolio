import { ErrorFactory } from "@praha/error-factory";

/** @description 진행 중이 아닌 수집을 성공 또는 실패로 완료하려 할 때 반환하는 오류. */
export class MatchSyncNotInProgressError extends ErrorFactory({
  name: "MatchSyncNotInProgressError",
  message: "진행 중인 경기 수집만 완료할 수 있습니다.",
}) {}
