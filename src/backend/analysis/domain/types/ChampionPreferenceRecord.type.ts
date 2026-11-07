import type { AnalysisObservation } from "./AnalysisObservation.type";
import type { AnalysisPosition } from "./AnalysisPosition.type";

/** @description 선택 취향 분석에 필요한 한 경기의 챔피언·포지션 관측. 스펠·표시명·챔피언 역할 분류는 포함하지 않는다. */
export type ChampionPreferenceRecord = Readonly<{
  championId: AnalysisObservation<number>;
  position: AnalysisObservation<AnalysisPosition>;
}>;
