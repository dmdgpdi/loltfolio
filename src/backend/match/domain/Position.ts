/** @description Riot teamPosition 기준. BOTTOM은 원딜, UTILITY는 서포터를 나타낸다. */
export const Position = {
  /** @description 칼바람처럼 포지션 구분이 적용되지 않는 경기. 미제공 NOT_PROVIDED·판별 불가 UNKNOWN과 구분되는 실제 값이다. */
  NONE: "NONE",
  /** @description 탑 역할. */
  TOP: "TOP",
  /** @description 정글 역할. */
  JUNGLE: "JUNGLE",
  /** @description 미드 역할. */
  MIDDLE: "MIDDLE",
  /** @description 바텀 딜러 역할. 맵의 단순 위치 좌표가 아니다. */
  BOTTOM: "BOTTOM",
  /** @description 서포터 역할. */
  UTILITY: "UTILITY",
} as const;
