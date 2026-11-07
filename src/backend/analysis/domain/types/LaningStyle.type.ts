import type { AnalysisMetric } from "./AnalysisMetric.type";
import type { LaningPointSummary } from "./LaningPointSummary.type";
import type { MatchFrequency } from "./MatchFrequency.type";

/** @description 라인전 성장과 상대 격차. 우위 조건의 달성 빈도는 원천 판정 규칙을 합의한 뒤 계산한다. */
export type LaningStyle = Readonly<{
  matchCount: number;
  earlyAdvantage: MatchFrequency;
  laningAdvantage: MatchFrequency;
  averageLaneMinionsFirst10Minutes: AnalysisMetric<number>;
  averageMaximumLevelLead: AnalysisMetric<number>;
  averageTowerPlates: AnalysisMetric<number>;
  tenMinutes: LaningPointSummary;
  fifteenMinutes: LaningPointSummary;
}>;
