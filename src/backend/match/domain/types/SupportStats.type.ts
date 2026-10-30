import type { Stat } from "./Stat.type";

/** @description 아군 회복·보호와 적 제어 기록에 대한 선택 통계. 각 값은 AVAILABLE·NOT_PROVIDED·UNKNOWN 상태를 구분한다. */
export type SupportStats = Readonly<{
  /** @description 아군에게 제공한 총 회복량. */
  totalHealsOnTeammates: Stat<number>;
  /** @description 아군 보호막으로 막은 총 피해량. */
  totalDamageShieldedOnTeammates: Stat<number>;
  /** @description 적에게 군중 제어 효과를 적용한 시간(초). */
  timeCCingOthers: Stat<number>;
  /** @description 아군을 죽음에서 구한 관련 지표. 판정은 Riot 기준이다. */
  saveAllyFromDeath: Stat<number>;
  /** @description 적 챔피언을 이동 불가 상태로 만든 관련 지표. */
  enemyChampionImmobilizations: Stat<number>;
  /** @description 군중 제어 점수 최다 관련 지표. 실제 제어 시간과 구분한다. */
  highestCrowdControlScore: Stat<number>;
  /** @description 적을 이동 불가 상태로 만든 뒤 아군과 처치한 관련 지표. */
  immobilizeAndKillWithAlly: Stat<number>;
}>;
