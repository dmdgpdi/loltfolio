import type { Stat } from "./Stat.type";

/** @description 정글 몬스터와 초반 정글 활동 기록에 대한 선택 통계. 각 값은 AVAILABLE·NOT_PROVIDED·UNKNOWN 상태를 구분한다. */
export type JungleStats = Readonly<{
  /** @description 참가자 통계의 적 정글 미니언 처치 수. enemyJungleMonsterKills와 합산하거나 대체하지 않는다. */
  totalEnemyJungleMinionsKilled: Stat<number>;
  /** @description challenges의 적 정글 몬스터 처치 지표. 참가자 통계의 유사 필드와 별도로 보존한다. */
  enemyJungleMonsterKills: Stat<number>;
  /** @description 10분 이전 정글 CS 지표. */
  jungleCsBefore10Minutes: Stat<number>;
  /** @description 정글러의 초반 정글 내 상대 정글러 처치 관련 지표. */
  junglerKillsEarlyJungle: Stat<number>;
  /** @description 정글러의 초반 라이너 처치 관련 지표. */
  killsOnLanersEarlyJungleAsJungler: Stat<number>;
  /** @description 바위 게 처치 수. */
  scuttleCrabKills: Stat<number>;
  /** @description 적 버프 탈취 관련 지표. */
  buffsStolen: Stat<number>;
}>;
