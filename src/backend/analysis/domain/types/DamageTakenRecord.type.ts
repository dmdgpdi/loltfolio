import type { AnalysisObservation } from "./AnalysisObservation.type";

/** @description 피해 부담에 대한 한 경기 관측. 받은 피해와 감소시킨 피해는 별도 수치이며 팀 비중은 원천 비율이다. */
export type DamageTakenRecord = Readonly<{
  damageTaken: AnalysisObservation<number>;
  damageMitigated: AnalysisObservation<number>;
  teamDamageTakenRatio: AnalysisObservation<number>;
}>;
