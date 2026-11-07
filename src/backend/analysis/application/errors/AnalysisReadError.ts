import { ErrorFactory } from "@praha/error-factory";

/** @description 저장된 표본 범위나 경기 입력을 읽지 못한 실패. 정상적인 조회 부재 null과 구분한다. */
export class AnalysisReadError extends ErrorFactory({
  name: "AnalysisReadError",
  message: "분석 대상 경기 정보를 조회할 수 없습니다.",
}) {}
