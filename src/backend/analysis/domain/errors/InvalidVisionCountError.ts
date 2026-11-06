import { ErrorFactory } from "@praha/error-factory";

/** @description 시야 행동 횟수와 합계가 0 이상의 안전한 정수가 아니면 분석을 거부한다. */
export class InvalidVisionCountError extends ErrorFactory({
  name: "InvalidVisionCountError",
  message: "와드 행동 횟수와 합계는 0 이상의 안전한 정수여야 합니다.",
}) {}
