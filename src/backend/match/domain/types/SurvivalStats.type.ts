import type { Stat } from "./Stat.type";

/** @description 피해 수용과 생존 기록에 대한 선택 통계. 각 값은 AVAILABLE·NOT_PROVIDED·UNKNOWN 상태를 구분한다. */
export type SurvivalStats = Readonly<{
  /** @description 받은 총 피해량. */
  totalDamageTaken: Stat<number>;
  /** @description 방어 효과 등으로 경감한 피해량. */
  damageSelfMitigated: Stat<number>;
  /** @description 가장 오래 생존한 구간의 길이(초). */
  longestTimeSpentLiving: Stat<number>;
  /** @description 팀 전체가 받은 피해 중 본인의 비율. 저장 시 백분율로 변환하지 않는다. */
  damageTakenOnTeamPercentage: Stat<number>;
  /** @description 체력이 한 자릿수까지 내려간 뒤 생존한 횟수. */
  survivedSingleDigitHpCount: Stat<number>;
  /** @description 큰 피해를 받고 생존한 challenges 지표. 피해 임계값은 자체 정의하지 않는다. */
  tookLargeDamageSurvived: Stat<number>;
  /** @description 교전에서 세 번의 이동 불가 효과를 받고 생존한 관련 지표. */
  survivedThreeImmobilizesInFight: Stat<number>;
  /** @description 회피한 논타깃 스킬 관련 지표. */
  skillshotsDodged: Stat<number>;
}>;
