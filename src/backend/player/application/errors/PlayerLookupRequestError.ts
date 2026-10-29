import { ErrorFactory } from "@praha/error-factory";

export class PlayerLookupRequestError extends ErrorFactory({
  name: "PlayerLookupRequestError",
  message: "플레이어 조회 요청이 거부되었습니다.",
  fields: ErrorFactory.fields<{ status: number }>(),
}) {}
