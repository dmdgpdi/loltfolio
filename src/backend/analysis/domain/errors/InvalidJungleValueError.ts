import { ErrorFactory } from "@praha/error-factory";

/** @description 정글 지표가 비음수 수치 또는 횟수의 안전한 집계 범위를 벗어나면 입력 오류로 반환한다. */
export class InvalidJungleValueError extends ErrorFactory({
  name: "InvalidJungleValueError",
  message: "정글 지표의 값이나 합계가 허용 범위를 벗어났습니다.",
}) {}
