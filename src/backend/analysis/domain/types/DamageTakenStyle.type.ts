import type { AnalysisMetric } from "./AnalysisMetric.type";

/** @description 피해 수용·경감과 팀 피해 부담을 구분한다. 받은 피해와 경감량을 더해 총 탱킹량으로 만들지 않는다. */
export type DamageTakenStyle = Readonly<{
  matchCount: number;
  averageDamageTaken: AnalysisMetric<number>;
  averageDamageMitigated: AnalysisMetric<number>;
  averageTeamDamageTakenPercentage: AnalysisMetric<number>;
}>;
