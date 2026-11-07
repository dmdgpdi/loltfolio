import type { AnalysisObservation } from "./AnalysisObservation.type";

/** @description 적 제어 횟수·시간·아군 연계 처치의 한 경기 관측. 횟수와 시간은 독립 지표다. */
export type CrowdControlRecord = Readonly<{
  immobilizations: AnalysisObservation<number>;
  crowdControlSeconds: AnalysisObservation<number>;
  immobilizeAndKillWithAlly: AnalysisObservation<number>;
}>;
