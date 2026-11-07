/** @description 분석이 소유한 원천 관측 상태. 외부 모듈에 의존하지 않으며 실제 0·false와 미확보를 구분한다. */
export type AnalysisObservation<T> =
  | Readonly<{ status: "AVAILABLE"; value: T }>
  | Readonly<{ status: "NOT_PROVIDED" }>
  | Readonly<{ status: "UNKNOWN" }>;
