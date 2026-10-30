import type { Result } from "@praha/byethrow";
import type { PlayerMatch } from "../domain/PlayerMatch";
import type { QueueId } from "../domain/types/QueueId.type";
import type { MatchCollectionError } from "./errors/MatchCollectionError";

/** @description 검증된 매칭 종류로 경기 목록과 플레이어별 상세 기록을 조회하는 외부 수집 계약. */
export interface RiotMatchClient {
  /** @description 지정한 큐의 경기 ID를 최근 순서로 조회한다. 큐는 지원하는 QueueId만 허용한다. */
  findRecentMatchIds(
    puuid: string,
    queueId: QueueId,
    count: number,
    start?: number,
  ): Promise<Result.Result<readonly string[], MatchCollectionError>>;

  /** @description 플레이어 한 명의 기록을 추출하며 중단 신호로 상세·Timeline의 후속 HTTP 요청을 취소할 수 있다. */
  findPlayerMatch(
    matchId: string,
    puuid: string,
    signal?: AbortSignal,
  ): Promise<Result.Result<PlayerMatch, MatchCollectionError>>;
}
