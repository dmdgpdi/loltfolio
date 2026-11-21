import type { Result } from "@praha/byethrow";
import type { MatchCollectionAttemptError } from "./errors/MatchCollectionAttemptError";
import type { CollectedMatchBatch } from "./types/CollectedMatchBatch.type";
import type { MatchCollectionTarget } from "./types/MatchCollectionTarget.type";
/** @description 다음 단계에서 기존 수집 로직을 연결할 경계다. 작업 접수·상태 변경·최종 표본 공개는 하지 않는다. */
export interface MatchCollectionSource {
  /** @description 최신 최대 20개 ID를 한 번 조회한다. 호출자는 저장 성공 전 상세 수집을 시작하지 않는다. */
  findSelection(
    target: MatchCollectionTarget,
    signal: AbortSignal,
  ): Promise<Result.Result<readonly string[], MatchCollectionAttemptError>>;
  /** @description 확정 목록의 DB 기록을 재사용하고 누락만 수집한다. 신규 기록·결론을 반환하며 권한 검증 없는 저장은 하지 않는다. */
  collectSelection(
    target: MatchCollectionTarget,
    ids: readonly string[],
    signal: AbortSignal,
  ): Promise<Result.Result<CollectedMatchBatch, MatchCollectionAttemptError>>;
}
