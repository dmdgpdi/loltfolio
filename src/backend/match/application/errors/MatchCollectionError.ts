import { ErrorFactory } from "@praha/error-factory";

export class MatchCollectionError extends ErrorFactory({
  name: "MatchCollectionError",
  message: "경기 기록을 수집할 수 없습니다.",
  fields: ErrorFactory.fields<{
    retryAvailableAt?: Date;
    reason?:
      | "CONFIGURATION"
      | "INVALID_RESPONSE"
      | "HTTP"
      | "TIMEOUT"
      | "REQUEST_FAILED";
    status?: number;
  }>(),
}) {}
