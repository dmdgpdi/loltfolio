import { Result } from "@praha/byethrow";
import type { MatchCollectionJobFailure } from "@/backend/match/domain/types/MatchCollectionJobFailure.type";
import { InvalidMatchCollectionCommandError } from "./errors/InvalidMatchCollectionCommandError";
import type { MatchCollectionJobPersistenceError } from "./errors/MatchCollectionJobPersistenceError";
import type { MatchCollectionJobQuery } from "./MatchCollectionJobQuery";
import type { MatchCollectionJobReader } from "./MatchCollectionJobReader";
import type { MatchCollectionJobDto } from "./types/MatchCollectionJobDto.type";

/** @description 내부 작업 기록을 수집 중·완료 등 공개 상태로 투영하며 실행을 시작하지 않는다. */
export class ProjectedMatchCollectionJobReader
  implements MatchCollectionJobReader
{
  /** @description 쓰기 기능이 없는 상태 조회 포트만 주입한다. */
  constructor(private readonly query: MatchCollectionJobQuery) {}

  /** @description Date·실행 권한·내부 원인을 제외한 DTO 또는 작업 부재를 반환한다. */
  async findById(
    jobId: string,
  ): Promise<
    Result.Result<
      MatchCollectionJobDto | null,
      InvalidMatchCollectionCommandError | MatchCollectionJobPersistenceError
    >
  > {
    if (
      typeof jobId !== "string" ||
      jobId.length === 0 ||
      jobId !== jobId.trim()
    ) {
      return Result.fail(new InvalidMatchCollectionCommandError());
    }
    const found = await this.query.findById(jobId);
    if (Result.isFailure(found)) return found;
    if (found.value === null) return Result.succeed(null);
    const { job, retryAvailableAt } = found.value;
    const failure =
      job.status === "FAILED" && job.outcome?.status === "FAILED"
        ? job.outcome.failure
        : null;
    return Result.succeed(
      Object.freeze({
        jobId: job.jobId,
        target: Object.freeze({ puuid: job.puuid, queueId: job.queueId }),
        status:
          job.status === "RETRY_WAIT" || job.status === "FINALIZING"
            ? "RUNNING"
            : job.status,
        requestedAt: job.requestedAt.toISOString(),
        startedAt: job.startedAt?.toISOString() ?? null,
        finishedAt: job.finishedAt?.toISOString() ?? null,
        failure:
          failure === null
            ? null
            : Object.freeze({
                code: failure.code,
                message: failureMessage(failure.code),
              }),
        retryAvailableAt: retryAvailableAt?.toISOString() ?? null,
      }),
    );
  }
}

/** @description 도메인 실패 코드에 고정된 안내만 사용하여 원본 예외가 화면에 노출되지 않게 한다. */
function failureMessage(code: MatchCollectionJobFailure["code"]): string {
  const messages: Record<MatchCollectionJobFailure["code"], string> = {
    WORKER_INTERRUPTED: "수집 실행이 중단됐습니다.",
    TEMPORARY_FAILURE: "일시적인 장애로 수집하지 못했습니다.",
    RIOT_RATE_LIMITED: "Riot API 호출 제한으로 수집을 중단했습니다.",
    AUTHENTICATION_FAILED: "Riot API 인증에 실패했습니다.",
    CONFIGURATION_ERROR: "수집 실행 설정을 확인해야 합니다.",
    INVALID_RESPONSE: "경기 응답을 확인할 수 없어 수집을 중단했습니다.",
    COLLECTION_FAILED: "경기를 수집하지 못했습니다.",
    ATTEMPTS_EXHAUSTED: "자동 복구 횟수를 소진했습니다. 다시 요청해 주세요.",
  };
  return messages[code];
}
