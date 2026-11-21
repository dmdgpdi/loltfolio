/** @description Application이 분류한 실패 사유와 API 재시도 시각이다. 원본 예외와 실행 권한은 도메인 기록에 포함하지 않는다. */
export type MatchCollectionJobFailure = Readonly<{
  code:
    | "WORKER_INTERRUPTED"
    | "TEMPORARY_FAILURE"
    | "RIOT_RATE_LIMITED"
    | "AUTHENTICATION_FAILED"
    | "CONFIGURATION_ERROR"
    | "INVALID_RESPONSE"
    | "COLLECTION_FAILED"
    | "ATTEMPTS_EXHAUSTED";
  retryAvailableAt: Date | null;
}>;
