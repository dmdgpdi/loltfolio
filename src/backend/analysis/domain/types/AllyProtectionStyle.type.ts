import type { AnalysisMetric } from "./AnalysisMetric.type";
import type { CountStatistics } from "./CountStatistics.type";

/** @description 아군 보호 행동의 서로 다른 단위를 구분해 설명한다. 회복·보호막·구출을 하나의 점수로 합치지 않는다. */
export type AllyProtectionStyle = Readonly<{
  matchCount: number;
  averageHealingToAllies: AnalysisMetric<number>;
  averageDamageShieldedOnAllies: AnalysisMetric<number>;
  allySaves: AnalysisMetric<CountStatistics>;
}>;
