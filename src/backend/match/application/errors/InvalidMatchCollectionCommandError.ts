import { ErrorFactory } from "@praha/error-factory";
/** @description 지원하지 않는 대상·잘못된 작업 ID나 수집 시도 설정을 거부한다. */
export class InvalidMatchCollectionCommandError extends ErrorFactory({
  name: "InvalidMatchCollectionCommandError",
  message: "경기 수집 요청이 유효하지 않습니다.",
}) {}
