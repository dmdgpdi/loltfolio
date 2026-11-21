import type { PlayerMatch } from "@/backend/match/domain/PlayerMatch";
import type { MatchCollectionJobOutcome } from "@/backend/match/domain/types/MatchCollectionJobOutcome.type";
/** @description 확정 목록에서 확보한 신규 경기와 수집 결론이다. 캐시 재사용·부분 성공 판정은 수집 구현이 담당한다. */
export type CollectedMatchBatch = Readonly<{
  matches: readonly PlayerMatch[];
  outcome: MatchCollectionJobOutcome;
}>;
