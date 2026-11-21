import { ErrorFactory } from "@praha/error-factory";
import type { ExecutionLease } from "@/backend/match/application/types/ExecutionLease.type";
import type { MatchCollectionJobOutcome } from "@/backend/match/domain/types/MatchCollectionJobOutcome.type";
/** @description 관측한 결과 기록에 실패했다. 호출자는 수집을 재실행하지 말고 저장 상태 확인 후 이 결과의 기록만 재시도한다. */
export class MatchCollectionOutcomeSaveError extends ErrorFactory({
  name: "MatchCollectionOutcomeSaveError",
  message: "수집 결과의 저장 여부를 확인해야 합니다.",
  fields: ErrorFactory.fields<{
    outcome: MatchCollectionJobOutcome;
    lease: ExecutionLease;
  }>(),
}) {}
