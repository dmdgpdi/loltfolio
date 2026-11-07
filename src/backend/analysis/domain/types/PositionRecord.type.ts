import type { AnalysisObservation } from "./AnalysisObservation.type";
import type { AnalysisPosition } from "./AnalysisPosition.type";

/** @description 분석 대상 한 경기에서 확보한 역할 관측. 위치나 챔피언으로 역할을 추정하지 않는다. */
export type PositionRecord = Readonly<{
  position: AnalysisObservation<AnalysisPosition>;
}>;
