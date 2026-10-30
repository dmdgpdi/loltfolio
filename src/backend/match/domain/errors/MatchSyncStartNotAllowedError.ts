import { ErrorFactory } from "@praha/error-factory";

/** @description 중복 수집 또는 성공 대기·API 재시도 제한 때문에 수집 시작이 거부된 오류. */
export class MatchSyncStartNotAllowedError extends ErrorFactory({
  name: "MatchSyncStartNotAllowedError",
  message: "현재 경기 수집을 시작할 수 없습니다.",
}) {}
