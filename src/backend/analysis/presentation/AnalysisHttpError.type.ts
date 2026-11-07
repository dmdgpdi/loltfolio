/** @description 조회 API의 실패 본문. 내부 예외·DB 정보 없이 안정적인 코드와 표시용 메시지만 전달한다. */
export type AnalysisHttpError = Readonly<{
  error: Readonly<{
    code:
      | "INVALID_ANALYSIS_QUERY"
      | "ANALYSIS_NOT_FOUND"
      | "ANALYSIS_READ_FAILED"
      | "ANALYSIS_CALCULATION_FAILED"
      | "INTERNAL_ERROR";
    message: string;
  }>;
}>;
