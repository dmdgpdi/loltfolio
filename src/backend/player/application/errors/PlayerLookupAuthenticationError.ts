import { ErrorFactory } from "@praha/error-factory";

export class PlayerLookupAuthenticationError extends ErrorFactory({
  name: "PlayerLookupAuthenticationError",
  message: "플레이어 조회 인증에 실패했습니다.",
  fields: ErrorFactory.fields<{ status: number }>(),
}) {}
