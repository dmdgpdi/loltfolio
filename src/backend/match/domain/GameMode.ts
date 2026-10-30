/** @description 게임 규칙. 전체 목록: https://static.developer.riotgames.com/docs/lol/gameModes.json */
export const GameMode = {
  /** @description 협곡 등에서 사용하는 클래식 규칙. 솔로 랭크만을 뜻하지 않는다. */
  CLASSIC: "CLASSIC",
  /** @description 칼바람 나락 규칙. */
  ARAM: "ARAM",
  /** @description 신속 모드 규칙. */
  SWIFTPLAY: "SWIFTPLAY",
} as const;
