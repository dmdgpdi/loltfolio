import { ErrorFactory } from "@praha/error-factory";
import type { MatchRepositoryError } from "../../domain/errors/MatchRepositoryError";

/** @description 경기 수집의 원래 오류와 확보 기록 또는 실패 상태의 저장 오류를 함께 보존한다. */
export class MatchCollectionFailureSaveError extends ErrorFactory({
  name: "MatchCollectionFailureSaveError",
  message: "경기 수집 결과 또는 실패 상태를 저장할 수 없습니다.",
  fields: ErrorFactory.fields<{ saveError: MatchRepositoryError }>(),
}) {}
