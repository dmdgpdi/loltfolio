import type { MatchCollectionWorkerSettings } from "./infrastructure/worker/MatchCollectionWorkerSettings.type";

/** @description 개발·운영의 수집·복구 동작에 같은 초기값을 적용한다. 실측 후 공통 값을 조정하며 테스트는 별도 설정을 주입할 수 있다. */
export const config: MatchCollectionWorkerSettings = Object.freeze({
  maxAttempts: 3,
  leaseDurationMs: 60_000,
  heartbeatIntervalMs: 10_000,
  retryDelayMs: 5_000,
  idlePollIntervalMs: 1_000,
});
