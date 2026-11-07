import type { AnalysisPosition } from "./AnalysisPosition.type";

/** @description 분석 대상의 역할별 경기 수. 모든 역할의 수와 미제공·판별 불가 수의 합은 전체 경기 수다. */
export type PositionDistribution = Readonly<{
  matchCount: number;
  byPosition: Readonly<Record<AnalysisPosition, number>>;
  notProvidedMatchCount: number;
  unknownMatchCount: number;
}>;
