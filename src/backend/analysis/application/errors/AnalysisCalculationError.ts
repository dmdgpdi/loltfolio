import { ErrorFactory } from "@praha/error-factory";

/** @description 확보된 입력이 도메인 계산 계약을 위반한 실패. 미제공이나 조회 부재로 숨기지 않는다. */
export class AnalysisCalculationError extends ErrorFactory({
  name: "AnalysisCalculationError",
  message: "저장된 경기 정보로 분석을 계산할 수 없습니다.",
}) {}
