import type { AnalysisMetric } from "./AnalysisMetric.type";

/** @description 유효한 선택 관측의 값별 빈도. 동률 중 임의의 1위를 만들지 않고 빈도 목록을 보존한다. */
export type PreferenceDistribution<T> = AnalysisMetric<
  readonly Readonly<{ value: T; matchCount: number }>[]
>;
