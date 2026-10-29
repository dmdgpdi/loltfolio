import { ErrorFactory } from "@praha/error-factory";

export class PlayerLookupError extends ErrorFactory({
  name: "PlayerLookupError",
  message: "플레이어 정보를 조회할 수 없습니다.",
}) {}
