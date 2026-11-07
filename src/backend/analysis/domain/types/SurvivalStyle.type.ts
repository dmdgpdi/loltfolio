import type { AnalysisMetric } from "./AnalysisMetric.type";
import type { CountStatistics } from "./CountStatistics.type";
import type { MatchFrequency } from "./MatchFrequency.type";

/** @description 무데스·평균 사망과 위험 상황 생존을 설명한다. 서로 다른 생존 횟수를 합산하지 않는다. */
export type SurvivalStyle = Readonly<{
  matchCount: number;
  deaths: AnalysisMetric<CountStatistics>;
  deathlessMatches: MatchFrequency;
  singleDigitHpSurvivals: AnalysisMetric<CountStatistics>;
  largeDamageSurvivals: AnalysisMetric<CountStatistics>;
  threeImmobilizationSurvivals: AnalysisMetric<CountStatistics>;
  averageLongestLifeSeconds: AnalysisMetric<number>;
}>;
