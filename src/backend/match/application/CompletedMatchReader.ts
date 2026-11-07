import type { Result } from "@praha/byethrow";
import type { MatchRepositoryError } from "../domain/errors/MatchRepositoryError";
import type { QueueId } from "../domain/types/QueueId.type";
import type { CompletedMatchSet } from "./types/CompletedMatchSet.type";

/** @description 다른 모듈에 공개하는 저장 경기 읽기 경계. 완료 목록이 없는 과거 기록을 추정하거나 수집·저장하지 않는다. */
export interface CompletedMatchReader {
  /** @description 최신 완료 ID 범위의 분석 가능 경기를 ID 순서로 읽는다. 완료 목록이 없으면 null이며 빈 완료 목록은 빈 집합이다. */
  findLatest(
    puuid: string,
    queueId: QueueId,
  ): Promise<Result.Result<CompletedMatchSet | null, MatchRepositoryError>>;
}
