import { ErrorFactory } from "@praha/error-factory";

export class PlayerLookupResponseError extends ErrorFactory({
  name: "PlayerLookupResponseError",
  message: "플레이어 조회 응답이 유효하지 않습니다.",
}) {}
