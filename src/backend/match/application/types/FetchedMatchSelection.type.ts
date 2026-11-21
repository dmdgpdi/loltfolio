import type { MatchCollectionError } from "@/backend/match/application/errors/MatchCollectionError";
import type { PlayerMatch } from "@/backend/match/domain/PlayerMatch";

/** @description 고정 목록의 캐시·신규 기록과 원본 오류를 분리한 읽기 결과다. 저장·수집 상태 변경은 포함하지 않는다. */
export type FetchedMatchSelection = Readonly<{
  selectedMatchIds: readonly string[];
  cachedMatches: readonly PlayerMatch[];
  matches: readonly PlayerMatch[];
  errors: readonly MatchCollectionError[];
  failure: MatchCollectionError | null;
}>;
