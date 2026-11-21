import { ErrorFactory } from "@praha/error-factory";

/** @description 현재 상태·복구 대기·시도 한도·고정 목록에 의해 요청한 변경이 허용되지 않는 경우다. */
export class MatchCollectionJobTransitionError extends ErrorFactory({
  name: "MatchCollectionJobTransitionError",
  message: "현재 경기 수집 작업에서는 요청한 변경을 수행할 수 없습니다.",
}) {}
