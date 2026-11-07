import type { AnalysisObservation } from "./AnalysisObservation.type";

/** @description 적 포탑 근처 처치와 전체 처치의 한 경기 관측. 다이브나 생존 성공으로 해석하지 않는다. */
export type EnemyTowerKillRecord = Readonly<{
  killsNearEnemyTower: AnalysisObservation<number>;
  kills: AnalysisObservation<number>;
}>;
