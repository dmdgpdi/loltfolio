import { ErrorFactory } from "@praha/error-factory";
import type { MatchRepositoryError } from "../../domain/errors/MatchRepositoryError";

export class MatchCollectionFailureSaveError extends ErrorFactory({
  name: "MatchCollectionFailureSaveError",
  message: "경기 수집 실패 상태를 저장할 수 없습니다.",
  fields: ErrorFactory.fields<{ saveError: MatchRepositoryError }>(),
}) {}
