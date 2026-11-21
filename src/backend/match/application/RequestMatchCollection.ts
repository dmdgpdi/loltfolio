import { Result } from "@praha/byethrow";
import { QueueId } from "@/backend/match/domain/QueueId";
import { InvalidMatchCollectionCommandError } from "./errors/InvalidMatchCollectionCommandError";
import type { MatchCollectionAdmissionRejectedError } from "./errors/MatchCollectionAdmissionRejectedError";
import type { MatchCollectionJobPersistenceError } from "./errors/MatchCollectionJobPersistenceError";
import type { MatchCollectionAdmission } from "./MatchCollectionAdmission";
import type { MatchCollectionAdmissionResult } from "./types/MatchCollectionAdmissionResult.type";
import type { MatchCollectionTarget } from "./types/MatchCollectionTarget.type";

/** @description 수집 완료를 기다리지 않고 유효한 대상의 작업 접수만 요청한다. */
export class RequestMatchCollection {
  /** @description 원자적 접수 포트와 새 작업에 적용할 시도 한도를 주입한다. */
  constructor(
    private readonly admission: MatchCollectionAdmission,
    private readonly maxAttempts: number,
  ) {}

  /** @description 새 접수·활성 작업 공유·제한 거부·저장 실패를 구분한다. 대상별 직렬화는 접수 포트의 원자적 계약이다. */
  async execute(
    target: MatchCollectionTarget,
  ): Promise<
    Result.Result<
      MatchCollectionAdmissionResult,
      | InvalidMatchCollectionCommandError
      | MatchCollectionAdmissionRejectedError
      | MatchCollectionJobPersistenceError
    >
  > {
    if (
      typeof target.puuid !== "string" ||
      target.puuid.length === 0 ||
      target.puuid !== target.puuid.trim() ||
      !Object.values(QueueId).includes(target.queueId) ||
      !Number.isSafeInteger(this.maxAttempts) ||
      this.maxAttempts < 1
    ) {
      return Result.fail(new InvalidMatchCollectionCommandError());
    }
    return this.admission.admit(Object.freeze({ ...target }), this.maxAttempts);
  }
}
