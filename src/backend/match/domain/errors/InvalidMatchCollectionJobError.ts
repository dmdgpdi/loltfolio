import { ErrorFactory } from "@praha/error-factory";

/** @description 작업 식별자·시각·시도 한도·선택 목록·종료 결과가 도메인 입력 계약을 위반한 경우다. */
export class InvalidMatchCollectionJobError extends ErrorFactory({
  name: "InvalidMatchCollectionJobError",
  message: "경기 수집 작업의 입력이 유효하지 않습니다.",
}) {}
