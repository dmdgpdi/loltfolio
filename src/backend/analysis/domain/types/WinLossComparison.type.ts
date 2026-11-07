import type { WinLossMetric } from "./WinLossMetric.type";

/** @description 같은 플레이어의 승패별 행동 차이. 인과나 타인 대비 우열을 의미하지 않는다. */
export type WinLossComparison = Readonly<{
  matchCount: number;
  winMatchCount: number;
  lossMatchCount: number;
  winNotProvidedMatchCount: number;
  winUnknownMatchCount: number;
  enemyMissingPings: WinLossMetric;
  dangerPings: WinLossMetric;
  retreatPings: WinLossMetric;
  controlWardsBought: WinLossMetric;
  wardsRemoved: WinLossMetric;
  soloKills: WinLossMetric;
}>;
