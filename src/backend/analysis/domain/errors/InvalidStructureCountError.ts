import { ErrorFactory } from "@praha/error-factory";

/** @description 구조물 관련 횟수와 합계가 0 이상의 안전한 정수가 아니면 분석을 거부한다. */
export class InvalidStructureCountError extends ErrorFactory({
  name: "InvalidStructureCountError",
  message: "구조물 행동 횟수와 합계는 0 이상의 안전한 정수여야 합니다.",
}) {}
