import type { AnalysisMetric } from "./AnalysisMetric.type";
import type { CountStatistics } from "./CountStatistics.type";

/** @description 스킬샷 회피의 규모·평균·최다·발생 경기 수를 설명하는 독립 값모델이다. */
export type SkillshotDodgeStyle = Readonly<{
  matchCount: number;
  skillshotsDodged: AnalysisMetric<CountStatistics>;
}>;
