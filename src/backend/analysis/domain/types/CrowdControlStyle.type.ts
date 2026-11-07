import type { AnalysisMetric } from "./AnalysisMetric.type";
import type { CountStatistics } from "./CountStatistics.type";

/** @description 이동 불가 적용과 CC 시간·연계 처치로 설명하는 제어 성향. 임계값 달성 기준은 포함하지 않는다. */
export type CrowdControlStyle = Readonly<{
  matchCount: number;
  immobilizations: AnalysisMetric<CountStatistics>;
  averageCrowdControlSeconds: AnalysisMetric<number>;
  immobilizeAndKillWithAlly: AnalysisMetric<CountStatistics>;
}>;
