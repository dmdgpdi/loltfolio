import { ErrorFactory } from "@praha/error-factory";

export class PlayerNameRequiredError extends ErrorFactory({
  name: "PlayerNameRequiredError",
  message: "플레이어 이름은 비어 있을 수 없습니다.",
}) {}
