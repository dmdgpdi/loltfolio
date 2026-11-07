import type { AnalysisObservation } from "./AnalysisObservation.type";
import type { AnalysisPosition } from "./AnalysisPosition.type";
import type { LaningPoint } from "./LaningPoint.type";

/** @description 라인전 분석에 필요한 역할·Riot 우위 지표와 시점별 관측. 우위 지표를 골드 금액이나 불리언으로 바꾸지 않는다. */
export type LaningRecord = Readonly<{
  position: AnalysisObservation<AnalysisPosition>;
  earlyAdvantageIndicator: AnalysisObservation<number>;
  laningAdvantageIndicator: AnalysisObservation<number>;
  laneMinionsFirst10Minutes: AnalysisObservation<number>;
  maximumLevelLead: AnalysisObservation<number>;
  towerPlates: AnalysisObservation<number>;
  points: readonly LaningPoint[];
}>;
