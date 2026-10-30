/** @description NOT_STARTED는 미시작, IN_PROGRESS는 수집 중, SUCCEEDED는 수집 성공, PARTIALLY_SUCCEEDED는 일부 경기 조회 실패가 있는 최신화, FAILED는 수집 실패를 뜻한다. */
export type MatchSyncStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "SUCCEEDED"
  | "PARTIALLY_SUCCEEDED"
  | "FAILED";
