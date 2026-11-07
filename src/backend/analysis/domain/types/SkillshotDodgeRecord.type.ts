import type { AnalysisObservation } from "./AnalysisObservation.type";

/** @description 스킬샷 회피의 한 경기 관측. Riot의 원천 판정을 사용하며 다른 상황의 기록과 합산하지 않는다. */
export type SkillshotDodgeRecord = Readonly<{
  skillshotsDodged: AnalysisObservation<number>;
}>;
