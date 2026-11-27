/** @description 순차 작업 실행의 유효기간·갱신·대기·수집 시도 한도이다. 실행 진입점은 공통 설정을 사용하고 테스트는 별도 값을 주입한다. */
export type MatchCollectionWorkerSettings = Readonly<{
  leaseDurationMs: number;
  heartbeatIntervalMs: number;
  retryDelayMs: number;
  idlePollIntervalMs: number;
  maxAttempts: number;
}>;
