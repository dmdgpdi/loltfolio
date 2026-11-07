import { ErrorFactory } from "@praha/error-factory";

/** @description 완료 표본은 최대 20개의 중복 없는 비어 있지 않은 경기 ID로 구성해야 한다. 0경기 목록은 허용한다. */
export class InvalidMatchSelectionError extends ErrorFactory({
  name: "InvalidMatchSelectionError",
  message: "완료 수집의 경기 ID 목록이 유효하지 않습니다.",
}) {}
