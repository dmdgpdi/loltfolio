import { ErrorFactory } from "@praha/error-factory";

/** @description 경기 기록 또는 수집 상태의 조회·저장 실패를 나타내는 저장소 경계 오류. */
export class MatchRepositoryError extends ErrorFactory({
  name: "MatchRepositoryError",
  message: "경기 수집 기록을 조회하거나 저장할 수 없습니다.",
}) {}
