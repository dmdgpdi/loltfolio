import { ErrorFactory } from "@praha/error-factory";

/** @description 잘못된 처치 횟수·합계 또는 전체 킬보다 큰 솔로킬을 정상 분석 결과로 숨기지 않는다. */
export class InvalidSoloKillRecordError extends ErrorFactory({
  name: "InvalidSoloKillRecordError",
  message:
    "처치 횟수와 합계는 0 이상의 안전한 정수이며 솔로킬은 전체 킬을 넘을 수 없습니다.",
}) {}
