import type { AnalysisMetric } from "./AnalysisMetric.type";
import type { CountStatistics } from "./CountStatistics.type";

/** @description 정글 역할이 확보된 경기의 활동 성향. 각 지표의 표본 합은 jungleMatchCount이며 그 외 역할은 집계하지 않는다. */
export type JungleStyle = Readonly<{
  matchCount: number;
  jungleMatchCount: number;
  averageEnemyJungleMonsterKills: AnalysisMetric<number>;
  enemyJungleMinionsKilled: AnalysisMetric<CountStatistics>;
  scuttleCrabKills: AnalysisMetric<CountStatistics>;
  earlyLanerKills: AnalysisMetric<CountStatistics>;
  dragonTakedowns: AnalysisMetric<CountStatistics>;
  baronTakedowns: AnalysisMetric<CountStatistics>;
  buffsStolen: AnalysisMetric<CountStatistics>;
}>;
