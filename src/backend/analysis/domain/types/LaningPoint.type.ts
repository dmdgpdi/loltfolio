import type { AnalysisObservation } from "./AnalysisObservation.type";
import type { LaningGrowth } from "./LaningGrowth.type";

/** @description 10분 또는 15분의 실제 표본 시각과 성장 관측. 본인 표본 누락과 상대 비교 불가를 구분한다. */
export type LaningPoint = Readonly<{
  minute: 10 | 15;
  actualTimestampMs: AnalysisObservation<number>;
  own: AnalysisObservation<LaningGrowth>;
  opponentDifference: AnalysisObservation<LaningGrowth>;
}>;
