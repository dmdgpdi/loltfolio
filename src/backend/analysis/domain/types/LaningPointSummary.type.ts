import type { LaningGrowthSummary } from "./LaningGrowthSummary.type";

/** @description 한 시점의 본인 성장과 상대 차이를 분리한 집계 계약이다. */
export type LaningPointSummary = Readonly<{
  own: LaningGrowthSummary;
  opponentDifference: LaningGrowthSummary;
}>;
