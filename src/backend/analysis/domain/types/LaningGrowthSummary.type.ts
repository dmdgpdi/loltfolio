import type { AnalysisMetric } from "./AnalysisMetric.type";

/** @description 같은 시점의 성장 항목별 평균. 항목마다 유효 표본이 다르며 상대 격차 평균의 음수 부호를 유지한다. */
export type LaningGrowthSummary = Readonly<{
  gold: AnalysisMetric<number>;
  experience: AnalysisMetric<number>;
  level: AnalysisMetric<number>;
  laneCs: AnalysisMetric<number>;
  jungleCs: AnalysisMetric<number>;
}>;
