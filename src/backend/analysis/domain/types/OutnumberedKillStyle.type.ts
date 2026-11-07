import type { AnalysisMetric } from "./AnalysisMetric.type";
import type { CountStatistics } from "./CountStatistics.type";

/** @description 수적 열세 상황 처치의 규모·평균·최다·발생 경기 수를 설명하는 독립 값모델이다. */
export type OutnumberedKillStyle = Readonly<{
  matchCount: number;
  outnumberedKills: AnalysisMetric<CountStatistics>;
}>;
