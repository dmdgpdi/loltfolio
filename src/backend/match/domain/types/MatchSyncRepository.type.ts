import type { Result } from "@praha/byethrow";
import type { MatchRepositoryError } from "../errors/MatchRepositoryError";
import type { MatchSyncStartNotAllowedError } from "../errors/MatchSyncStartNotAllowedError";
import type { MatchSync } from "../MatchSync";
import type { QueueId } from "./QueueId.type";

/** @description 플레이어·큐별 수집 시작을 원자적으로 확보하고 동일 시도의 완료만 저장하는 계약. */
export interface MatchSyncRepository {
  /**
   * @description (puuid, queueId)별 조회 또는 최초 생성, start(now), 저장을 원자적으로 수행한다.
   * 반환 객체는 저장 상태와 참조를 공유하지 않아야 한다.
   */
  tryStart(
    puuid: string,
    queueId: QueueId,
    now: Date,
  ): Promise<
    Result.Result<
      MatchSync,
      MatchRepositoryError | MatchSyncStartNotAllowedError
    >
  >;

  /** @description 같은 (puuid, queueId, lastAttemptAt)의 IN_PROGRESS 작업만 완료하며, 실패 시 기존 저장 상태를 보존한다. */
  update(sync: MatchSync): Promise<Result.Result<void, MatchRepositoryError>>;
}
