import type { PositionDistribution } from "./PositionDistribution.type";
import type { PreferenceDistribution } from "./PreferenceDistribution.type";

/** @description 챔피언·역할·스펠 조합의 선택 빈도. 스펠 조합 동등성과 동률 정렬은 계산 구현 전에 정한다. */
export type ChampionPreference = Readonly<{
  matchCount: number;
  champions: PreferenceDistribution<number>;
  positions: PositionDistribution;
  spellCombinations: PreferenceDistribution<readonly [number, number]>;
}>;
