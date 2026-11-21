/** @description 수집 실행·복구 대기·결과 확정을 구분하는 내부 상태이며 화면 상태로 직접 노출하지 않는다. */
export type MatchCollectionJobStatus =
  | "QUEUED"
  | "RUNNING"
  | "RETRY_WAIT"
  | "FINALIZING"
  | "SUCCEEDED"
  | "PARTIALLY_SUCCEEDED"
  | "FAILED";
