import type { AnalysisObservation } from "./AnalysisObservation.type";

/** @description 승패와 비교할 행동의 한 경기 관측. 위험·후퇴 핑은 각각 유지하고 누락된 승패를 패배로 간주하지 않는다. */
export type WinLossRecord = Readonly<{
  win: AnalysisObservation<boolean>;
  enemyMissingPings: AnalysisObservation<number>;
  dangerPings: AnalysisObservation<number>;
  retreatPings: AnalysisObservation<number>;
  controlWardsBought: AnalysisObservation<number>;
  wardsRemoved: AnalysisObservation<number>;
  soloKills: AnalysisObservation<number>;
}>;
