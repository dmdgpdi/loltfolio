import { ErrorFactory } from "@praha/error-factory";

/** @description 골드 격차·집계가 안전한 정수 범위를 벗어나거나 확보된 승패가 불리언이 아니면 입력 오류다. */
export class InvalidComebackRecordError extends ErrorFactory({
  name: "InvalidComebackRecordError",
  message: "역전 분석의 골드 격차 또는 승패가 유효하지 않습니다.",
}) {}
