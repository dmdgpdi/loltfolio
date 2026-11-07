import type { AnalysisMetric } from "./AnalysisMetric.type";
import type { LaningPointSummary } from "./LaningPointSummary.type";
import type { MatchFrequency } from "./MatchFrequency.type";

/** @description 라인전 성장과 상대 격차. 랭크의 탑·미드·원딜만 대상으로 하며 우위 값 1·0을 각각 달성·미달성으로 집계한다. */
export type LaningStyle = Readonly<{
  matchCount: number;
  laningMatchCount: number;
  earlyAdvantage: MatchFrequency;
  laningAdvantage: MatchFrequency;
  averageLaneMinionsFirst10Minutes: AnalysisMetric<number>;
  averageMaximumLevelLead: AnalysisMetric<number>;
  averageTowerPlates: AnalysisMetric<number>;
  tenMinutes: LaningPointSummary;
  fifteenMinutes: LaningPointSummary;
}>;
