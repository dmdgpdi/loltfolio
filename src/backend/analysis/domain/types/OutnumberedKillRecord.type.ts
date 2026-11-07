import type { AnalysisObservation } from "./AnalysisObservation.type";

/** @description 수적 열세 상황 처치의 한 경기 관측. Riot의 원천 판정을 사용하며 다른 상황의 기록과 합산하지 않는다. */
export type OutnumberedKillRecord = Readonly<{
  outnumberedKills: AnalysisObservation<number>;
}>;
