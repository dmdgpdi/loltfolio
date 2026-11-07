import type { AnalysisObservation } from "./AnalysisObservation.type";
import type { AnalysisPosition } from "./AnalysisPosition.type";

/** @description 한 경기의 챔피언·포지션·두 주문 슬롯 관측. 표시명과 챔피언 역할 분류는 포함하지 않는다. */
export type ChampionPreferenceRecord = Readonly<{
  championId: AnalysisObservation<number>;
  position: AnalysisObservation<AnalysisPosition>;
  summoner1Id: AnalysisObservation<number>;
  summoner2Id: AnalysisObservation<number>;
}>;
