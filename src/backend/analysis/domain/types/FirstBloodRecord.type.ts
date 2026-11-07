import type { FirstBloodObservation } from "./FirstBloodObservation.type";

/** @description 분석 대상으로 선정된 한 경기의 첫 킬 직접 획득과 어시스트. 경기 식별·선정은 포함하지 않는다. */
export type FirstBloodRecord = Readonly<{
  kill: FirstBloodObservation;
  assist: FirstBloodObservation;
}>;
