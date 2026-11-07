import type { AnalysisObservation } from "./AnalysisObservation.type";
import type { AnalysisPosition } from "./AnalysisPosition.type";

/** @description 정글 활동에 필요한 한 경기의 역할·자원·오브젝트 관측. 두 적 정글 원천 지표를 별도로 보존한다. */
export type JungleRecord = Readonly<{
  position: AnalysisObservation<AnalysisPosition>;
  enemyJungleMonsterKills: AnalysisObservation<number>;
  enemyJungleMinionsKilled: AnalysisObservation<number>;
  scuttleCrabKills: AnalysisObservation<number>;
  earlyLanerKills: AnalysisObservation<number>;
  dragonTakedowns: AnalysisObservation<number>;
  baronTakedowns: AnalysisObservation<number>;
  buffsStolen: AnalysisObservation<number>;
}>;
