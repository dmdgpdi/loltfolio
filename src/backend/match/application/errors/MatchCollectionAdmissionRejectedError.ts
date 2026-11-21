import { ErrorFactory } from "@praha/error-factory";
/** @description 작업 생성 전의 접수 제한이며 실행 중 작업의 실패와 구분한다. */
export class MatchCollectionAdmissionRejectedError extends ErrorFactory({
  name: "MatchCollectionAdmissionRejectedError",
  message: "경기 수집을 아직 요청할 수 없습니다.",
  fields: ErrorFactory.fields<{
    code: "COLLECTION_COOLDOWN" | "RIOT_RETRY_RESTRICTED";
    retryAvailableAt: Date;
  }>(),
}) {}
