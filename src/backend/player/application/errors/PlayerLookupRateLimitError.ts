import { ErrorFactory } from "@praha/error-factory";

export class PlayerLookupRateLimitError extends ErrorFactory({
  name: "PlayerLookupRateLimitError",
  message: "플레이어 조회 요청 한도를 초과했습니다.",
  fields: ErrorFactory.fields<{ retryAfter: string | null }>(),
}) {}
