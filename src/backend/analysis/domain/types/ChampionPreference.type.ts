import type { AnalysisPosition } from "./AnalysisPosition.type";
import type { PositionDistribution } from "./PositionDistribution.type";
import type { PreferenceDistribution } from "./PreferenceDistribution.type";

/** @description 챔피언·역할의 선택 빈도. 최다 동률을 모두 보존하며 스펠 취향은 포함하지 않는다. */
export type ChampionPreference = Readonly<{
  matchCount: number;
  champions: PreferenceDistribution<number>;
  mostPlayedChampions: readonly number[];
  positions: PositionDistribution;
  /** @description 실제 플레이한 다섯 역할의 빈도 목록. NONE과 미확보는 positions에 별도로 보존한다. */
  positionFrequencies: readonly Readonly<{
    value: Exclude<AnalysisPosition, "NONE">;
    matchCount: number;
  }>[];
  mostPlayedPositions: readonly Exclude<AnalysisPosition, "NONE">[];
}>;
