import { ErrorFactory } from "@praha/error-factory";
import type { MatchCollectionJobFailure } from "@/backend/match/domain/types/MatchCollectionJobFailure.type";
/** @description 수집 경계에서 분류한 실패와 원본 예외를 함께 보존한다. DB 접근 오류와 분리한다. */
export class MatchCollectionAttemptError extends ErrorFactory({
  name: "MatchCollectionAttemptError",
  message: "경기 수집 실행에 실패했습니다.",
  fields: ErrorFactory.fields<{ failure: MatchCollectionJobFailure }>(),
}) {}
