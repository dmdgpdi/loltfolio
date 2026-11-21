/** @description 경기 ID 목록의 시작 위치와 실행 취소 신호다. 생략 시 최신 첫 페이지를 조회한다. */
export type RiotMatchListOptions = Readonly<{
  start?: number;
  signal?: AbortSignal;
}>;
