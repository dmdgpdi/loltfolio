import { ErrorFactory } from "@praha/error-factory";

export class PlayerNotFoundError extends ErrorFactory({
  name: "PlayerNotFoundError",
  message: "플레이어를 찾을 수 없습니다.",
}) {}
