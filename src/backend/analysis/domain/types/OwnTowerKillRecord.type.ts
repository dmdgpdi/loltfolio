import type { AnalysisObservation } from "./AnalysisObservation.type";

/** @description 아군 포탑 아래 처치의 한 경기 관측. Riot의 원천 판정을 사용하며 다른 상황의 기록과 합산하지 않는다. */
export type OwnTowerKillRecord = Readonly<{
  killsUnderOwnTower: AnalysisObservation<number>;
}>;
