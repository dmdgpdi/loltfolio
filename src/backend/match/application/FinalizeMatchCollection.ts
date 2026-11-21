import { Result } from "@praha/byethrow";
import { MatchCollectionLeaseLostError } from "./errors/MatchCollectionLeaseLostError";
import type { MatchCollectionCompletion } from "./MatchCollectionCompletion";
import type { ClaimedMatchCollectionJob } from "./types/ClaimedMatchCollectionJob.type";
import type { MatchCollectionJobWriteError } from "./types/MatchCollectionJobWriteError.type";

/** @description 이미 기록한 결과의 최종 저장만 수행하며 Riot 수집 경계에 의존하지 않는다. */
export class FinalizeMatchCollection {
  /** @description 현재 실행 권한 확인과 완료 여부 재확인을 포함하는 원자적 완료 포트를 주입한다. */
  constructor(private readonly completion: MatchCollectionCompletion) {}

  /** @description FINALIZE 권한으로 저장된 결과만 확정한다. 완료 응답 유실 후 재호출도 저장소가 종료 여부부터 확인한다. */
  async execute(
    assignment: ClaimedMatchCollectionJob,
    signal: AbortSignal,
  ): Promise<Result.Result<void, MatchCollectionJobWriteError>> {
    if (
      signal.aborted ||
      assignment.lease.purpose !== "FINALIZE" ||
      assignment.job.jobId !== assignment.lease.jobId ||
      assignment.job.status !== "FINALIZING" ||
      assignment.job.outcome === null
    ) {
      return Result.fail(new MatchCollectionLeaseLostError());
    }
    return this.completion.finish(assignment.lease);
  }
}
