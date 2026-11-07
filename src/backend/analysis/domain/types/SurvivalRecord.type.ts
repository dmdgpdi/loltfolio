import type { AnalysisObservation } from "./AnalysisObservation.type";

/** @description 한 경기의 사망·생존 기록. 서로 겹칠 수 있는 위험 상황을 별도 관측으로 유지한다. */
export type SurvivalRecord = Readonly<{
  deaths: AnalysisObservation<number>;
  singleDigitHpSurvivals: AnalysisObservation<number>;
  largeDamageSurvivals: AnalysisObservation<number>;
  threeImmobilizationSurvivals: AnalysisObservation<number>;
  longestLifeSeconds: AnalysisObservation<number>;
}>;
