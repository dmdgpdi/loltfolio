import { ErrorFactory } from "@praha/error-factory";

/** @description 라인전 수치·게임 규칙·시점이 계약을 벗어나면 미제공이나 판별 불가로 숨기지 않는다. */
export class InvalidLaningRecordError extends ErrorFactory({
  name: "InvalidLaningRecordError",
  message: "라인전 관측의 값 또는 시점이 유효하지 않습니다.",
}) {}
