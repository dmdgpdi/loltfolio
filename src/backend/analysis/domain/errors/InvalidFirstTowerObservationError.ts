import { ErrorFactory } from "@praha/error-factory";

/** @description 확보된 첫 포탑 획득·어시스트 값이 불리언이 아니면 미제공이나 미관여로 숨기지 않는다. */
export class InvalidFirstTowerObservationError extends ErrorFactory({
  name: "InvalidFirstTowerObservationError",
  message: "확보된 첫 포탑 획득·어시스트 값은 불리언이어야 합니다.",
}) {}
