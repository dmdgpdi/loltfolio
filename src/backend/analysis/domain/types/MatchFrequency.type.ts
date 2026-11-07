import type { AnalysisMetric } from "./AnalysisMetric.type";

/** @description 조건을 판별할 수 있는 경기 중 충족한 경기 수와 백분율. 조건의 의미와 표본 범위는 소유 도메인이 정한다. */
export type MatchFrequency = AnalysisMetric<
  Readonly<{
    matchedMatchCount: number;
    percentage: number;
  }>
>;
