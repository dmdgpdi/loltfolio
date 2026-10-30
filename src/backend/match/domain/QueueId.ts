/** @description 매칭 종류. 전체 목록: https://static.developer.riotgames.com/docs/lol/queues.json */
export const QueueId = {
  /** @description 일반 교차 선택. */
  NORMAL_DRAFT: 400,
  /** @description 개인·2인 랭크. */
  RANKED_SOLO_DUO: 420,
  /** @description 일반 비공개 선택. */
  NORMAL_BLIND: 430,
  /** @description 자유 랭크. */
  RANKED_FLEX: 440,
  /** @description 칼바람 나락 매칭. */
  ARAM: 450,
  /** @description 신속 모드 매칭. */
  SWIFTPLAY: 480,
  /** @description 빠른 대전 매칭. */
  NORMAL_QUICKPLAY: 490,
  /** @description 소환사의 협곡 격전. */
  CLASH: 700,
  /** @description 칼바람 나락 격전. */
  ARAM_CLASH: 720,
} as const;
