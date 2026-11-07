import { ErrorFactory } from "@praha/error-factory";

/** @description 분석 수치·합계·승패 또는 공통 표본의 비중 관계가 계약을 벗어나면 입력 오류다. */
export class InvalidAnalysisValueError extends ErrorFactory({
  name: "InvalidAnalysisValueError",
  message: "분석 관측 또는 집계 값이 허용 범위를 벗어났습니다.",
}) {}
