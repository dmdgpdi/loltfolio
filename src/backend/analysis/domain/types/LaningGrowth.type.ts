import type { AnalysisObservation } from "./AnalysisObservation.type";

/** @description 한 시점의 골드·경험치·레벨·라인 CS·정글 CS 관측. 상대 차이일 때는 본인에서 상대를 뺀 음수도 유효하다. */
export type LaningGrowth = Readonly<{
  gold: AnalysisObservation<number>;
  experience: AnalysisObservation<number>;
  level: AnalysisObservation<number>;
  laneCs: AnalysisObservation<number>;
  jungleCs: AnalysisObservation<number>;
}>;
