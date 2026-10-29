import { ErrorFactory } from "@praha/error-factory";

export class TagLineRequiredError extends ErrorFactory({
  name: "TagLineRequiredError",
  message: "태그라인은 비어 있을 수 없습니다.",
}) {}
