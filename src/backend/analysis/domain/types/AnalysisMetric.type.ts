/** @description 한 지표의 유효·미제공·판별 불가 표본과 계산 결과. 계산 불가일 때 가상의 0을 제공하지 않는다. */
export type AnalysisMetric<T> = Readonly<{
  sampleCount: number;
  notProvidedCount: number;
  unknownCount: number;
}> &
  (
    | Readonly<{ status: "AVAILABLE"; value: T }>
    | Readonly<{ status: "UNAVAILABLE" }>
  );
