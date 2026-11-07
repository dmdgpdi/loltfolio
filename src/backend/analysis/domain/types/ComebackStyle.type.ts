import type { AnalysisMetric } from "./AnalysisMetric.type";
import type { MatchFrequency } from "./MatchFrequency.type";

/** @description 개인 15분 골드 열세 이후의 승리 기록. 팀 전체 역전이나 본인의 역전 기여도를 나타내지 않는다. */
export type ComebackStyle = Readonly<{
  matchCount: number;
  /** @description 골드 음수가 확인된 경기 수. 승패 미확보 경기도 포함한다. */
  deficitMatchCount: number;
  deficitWinRate: MatchFrequency;
  largestDeficitInWins: AnalysisMetric<number>;
  averageGoldDifferenceInWins: AnalysisMetric<number>;
}>;
