import type { AnalysisObservation } from "./AnalysisObservation.type";
import type { AnalysisPosition } from "./AnalysisPosition.type";

/** @description 확보된 같은 포지션 상대의 15분 골드 차이와 최종 승패. 차이는 본인에서 상대를 뺀 값이다. */
export type ComebackRecord = Readonly<{
  position: AnalysisObservation<AnalysisPosition>;
  goldDifferenceAt15Minutes: AnalysisObservation<number>;
  win: AnalysisObservation<boolean>;
}>;
