import { ErrorFactory } from "@praha/error-factory";

/** @description 확보된 역할 값이 분석에서 허용한 여섯 역할에 속하지 않으면 입력 오류로 반환한다. */
export class InvalidAnalysisPositionError extends ErrorFactory({
  name: "InvalidAnalysisPositionError",
  message: "확보된 포지션은 분석에서 허용한 역할이어야 합니다.",
}) {}
