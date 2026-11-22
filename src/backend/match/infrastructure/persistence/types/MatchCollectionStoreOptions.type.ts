/** @description 실행 환경에 맞춰 조정할 권한 유효기간과 수집 재시도 대기 시간이다. 단위는 밀리초다. */
export type MatchCollectionStoreOptions = Readonly<{
  leaseDurationMs: number;
  retryDelayMs: number;
}>;
