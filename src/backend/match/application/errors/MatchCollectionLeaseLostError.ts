import { ErrorFactory } from "@praha/error-factory";
/** @description 실행 목적·토큰·만료·작업 상태가 현재 소유권과 맞지 않아 추가 처리를 중단한다. */
export class MatchCollectionLeaseLostError extends ErrorFactory({
  name: "MatchCollectionLeaseLostError",
  message: "경기 수집 작업의 실행 권한이 없습니다.",
}) {}
