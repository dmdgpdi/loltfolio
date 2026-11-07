/** @description 두 값의 공통 표본에서 구한 합계 비중. 유효 표본 없음과 분모 0은 별개 계산 불가 사유다. */
export type AnalysisShare = Readonly<{
  sampleCount: number;
  excludedMatchCount: number;
}> &
  (
    | Readonly<{
        status: "AVAILABLE";
        numerator: number;
        denominator: number;
        percentage: number;
      }>
    | Readonly<{
        status: "UNAVAILABLE";
        reason: "NO_VALID_SAMPLES" | "ZERO_DENOMINATOR";
      }>
  );
