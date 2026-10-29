import { ErrorFactory } from "@praha/error-factory";

export class PlayerLookupUnavailableError extends ErrorFactory({
  name: "PlayerLookupUnavailableError",
  message: "플레이어 조회 서비스가 일시적으로 응답할 수 없습니다.",
  fields: ErrorFactory.fields<{ status: number }>(),
}) {}
