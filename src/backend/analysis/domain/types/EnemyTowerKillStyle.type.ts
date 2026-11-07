import type { AnalysisMetric } from "./AnalysisMetric.type";
import type { AnalysisShare } from "./AnalysisShare.type";
import type { CountStatistics } from "./CountStatistics.type";

/** @description 적 포탑 근처 처치의 규모와 전체 킬 대비 비중. 비중은 두 값의 공통 표본에서 계산한다. */
export type EnemyTowerKillStyle = Readonly<{
  matchCount: number;
  killsNearEnemyTower: AnalysisMetric<CountStatistics>;
  shareOfKills: AnalysisShare;
}>;
