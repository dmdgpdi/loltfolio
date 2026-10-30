import type { Result } from "@praha/byethrow";
import type { MatchRepositoryError } from "../errors/MatchRepositoryError";
import type { PlayerMatch } from "../PlayerMatch";
import type { QueueId } from "./QueueId.type";

/** @description 플레이어별 경기 기록의 조회와 일괄 저장 계약. 외부 API 응답이나 DB 구현 세부사항을 도메인에서 분리한다. */
export interface PlayerMatchRepository {
  /** @description 지정한 플레이어·큐에 대해 이미 저장된 경기만 ID 목록으로 조회하여 상세 API 재호출을 줄인다. */
  findByMatchIds(
    puuid: string,
    queueId: QueueId,
    matchIds: readonly string[],
  ): Promise<Result.Result<readonly PlayerMatch[], MatchRepositoryError>>;

  /** @description 배치 전체를 원자적으로 저장한다. 기존 (matchId, puuid)는 변경하지 않고 중복을 무시한다. */
  saveAll(
    matches: readonly PlayerMatch[],
  ): Promise<Result.Result<void, MatchRepositoryError>>;
}
