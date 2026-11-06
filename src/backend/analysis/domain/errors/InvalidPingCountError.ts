import { ErrorFactory } from "@praha/error-factory";

/** @description 핑 횟수 또는 합계가 정확히 표현 가능한 0 이상의 정수가 아니면 분석을 거부한다. */
export class InvalidPingCountError extends ErrorFactory({
  name: "InvalidPingCountError",
  message: "핑 횟수와 합계는 0 이상의 안전한 정수여야 합니다.",
}) {}
