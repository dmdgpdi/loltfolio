import type { Stat } from "./Stat.type";

/** @description 핑 종류별 사용 기록에 대한 선택 통계. 각 값은 AVAILABLE·NOT_PROVIDED·UNKNOWN 상태를 구분한다. */
export type PingStats = Readonly<{
  /** @description 적 사라짐 핑 사용 횟수. */
  enemyMissingPings: Stat<number>;
  /** @description 위험 핑 사용 횟수. */
  dangerPings: Stat<number>;
  /** @description 후퇴 핑 사용 횟수. getBackPings와 별도로 보존한다. */
  retreatPings: Stat<number>;
  /** @description Riot getBack 핑 사용 횟수. retreatPings와 합산하지 않는다. */
  getBackPings: Stat<number>;
  /** @description 가는 중 핑 사용 횟수. */
  onMyWayPings: Stat<number>;
  /** @description 총공격 핑 사용 횟수. */
  allInPings: Stat<number>;
  /** @description 도움 요청 핑 사용 횟수. */
  assistMePings: Stat<number>;
  /** @description Riot command 핑 사용 횟수. 다른 핑과 구분하여 보존한다. */
  commandPings: Stat<number>;
  /** @description 적 시야 핑 사용 횟수. */
  enemyVisionPings: Stat<number>;
  /** @description 시야 요청 핑 사용 횟수. */
  needVisionPings: Stat<number>;
  /** @description 압박 핑 사용 횟수. */
  pushPings: Stat<number>;
  /** @description 위치 사수 핑 사용 횟수. */
  holdPings: Stat<number>;
}>;
