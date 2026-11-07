import { ErrorFactory } from "@praha/error-factory";

/** @description 확보된 챔피언 ID가 양의 안전 정수가 아니면 미제공으로 숨기지 않는다. */
export class InvalidChampionIdError extends ErrorFactory({
  name: "InvalidChampionIdError",
  message: "확보된 챔피언 ID는 양의 안전 정수여야 합니다.",
}) {}
