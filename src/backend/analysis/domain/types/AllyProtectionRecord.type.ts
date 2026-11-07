import type { AnalysisObservation } from "./AnalysisObservation.type";

/** @description 아군에게 제공한 회복·보호막 흡수·구출의 한 경기 관측. 자기 회복이나 가상 보호막 생성량과 구분한다. */
export type AllyProtectionRecord = Readonly<{
  healingToAllies: AnalysisObservation<number>;
  damageShieldedOnAllies: AnalysisObservation<number>;
  allySaves: AnalysisObservation<number>;
}>;
