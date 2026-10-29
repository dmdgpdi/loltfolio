import { ErrorFactory } from "@praha/error-factory";

export class PlayerLookupConfigurationError extends ErrorFactory({
  name: "PlayerLookupConfigurationError",
  message: "플레이어 조회 설정이 유효하지 않습니다.",
}) {}
