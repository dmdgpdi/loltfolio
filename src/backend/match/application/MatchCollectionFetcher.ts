import { Result } from "@praha/byethrow";
import type { MatchRepositoryError } from "@/backend/match/domain/errors/MatchRepositoryError";
import type { PlayerMatch } from "@/backend/match/domain/PlayerMatch";
import type { PlayerMatchRepository } from "@/backend/match/domain/types/PlayerMatchRepository.type";
import { MatchCollectionError } from "./errors/MatchCollectionError";
import type { RiotMatchClient } from "./RiotMatchClient";
import type { FetchedMatchSelection } from "./types/FetchedMatchSelection.type";
import type { MatchCollectionTarget } from "./types/MatchCollectionTarget.type";

const RECENT_MATCH_LIMIT = 20;
const CONCURRENT_MATCH_LIMIT = 2;

/** @description 기존·작업 기반 수집이 공유하는 읽기 실행부다. 쓰기 Repository나 작업 상태를 소유하지 않는다. */
export class MatchCollectionFetcher {
  /** @description 캐시 읽기와 외부 경기 조회만 주입한다. */
  constructor(
    private readonly matches: Pick<PlayerMatchRepository, "findByMatchIds">,
    private readonly client: RiotMatchClient,
  ) {}

  /** @description 최신 한 페이지의 최대 20개를 원래 순서로 중복 제거하며 과거 페이지로 보충하지 않는다. */
  async findRecentMatchIds(
    target: MatchCollectionTarget,
    signal?: AbortSignal,
  ): Promise<Result.Result<readonly string[], MatchCollectionError>> {
    if (signal?.aborted) return Result.fail(aborted(signal));
    const found = await this.client.findRecentMatchIds(
      target.puuid,
      target.queueId,
      RECENT_MATCH_LIMIT,
      { start: 0, signal },
    );
    if (Result.isFailure(found)) return found;
    if (signal?.aborted) return Result.fail(aborted(signal));
    if (!(Array.isArray(found.value) && found.value.every(isMatchId))) {
      return Result.fail(
        new MatchCollectionError({ reason: "INVALID_RESPONSE" }),
      );
    }
    return Result.succeed(
      Object.freeze([...new Set(found.value.slice(0, RECENT_MATCH_LIMIT))]),
    );
  }

  /** @description 고정 목록의 캐시를 재사용하고 없는 경기만 수집한다. 기록·원본 오류를 반환하며 저장은 호출자에게 맡긴다. */
  async collectSelection(
    target: MatchCollectionTarget,
    ids: readonly string[],
    signal?: AbortSignal,
  ): Promise<
    Result.Result<
      FetchedMatchSelection,
      MatchRepositoryError | MatchCollectionError
    >
  > {
    if (signal?.aborted) return Result.fail(aborted(signal));
    if (
      !Array.isArray(ids) ||
      ids.length > RECENT_MATCH_LIMIT ||
      new Set(ids).size !== ids.length ||
      !ids.every(isMatchId)
    ) {
      return Result.fail(
        new MatchCollectionError({ reason: "INVALID_RESPONSE" }),
      );
    }
    const selected = Object.freeze([...ids]);
    if (selected.length === 0)
      return Result.succeed(this.selection(selected, [], [], []));
    const stored = await this.matches.findByMatchIds(
      target.puuid,
      target.queueId,
      selected,
    );
    if (Result.isFailure(stored)) return stored;
    if (signal?.aborted) return Result.fail(aborted(signal));
    const selectedIds = new Set(selected);
    const cached = new Map(
      stored.value
        .filter(
          (match) =>
            match.puuid === target.puuid &&
            match.queueId === target.queueId &&
            selectedIds.has(match.matchId),
        )
        .map((match) => [match.matchId, match]),
    );
    const fetched = await this.findMissingMatches(
      target,
      selected.filter((id) => !cached.has(id)),
      signal,
    );
    return Result.succeed(
      this.selection(
        selected,
        selected.flatMap((id) => {
          const match = cached.get(id);
          return match ? [match] : [];
        }),
        fetched.matches,
        fetched.errors,
      ),
    );
  }

  /** @description 중단 오류는 429를 우선하며 캐시도 없이 모두 실패한 경우 빈 성공으로 만들지 않는다. */
  private selection(
    ids: readonly string[],
    cached: readonly PlayerMatch[],
    matches: readonly PlayerMatch[],
    errors: readonly MatchCollectionError[],
  ): FetchedMatchSelection {
    const failure =
      errors.find((error) => error.status === 429) ??
      errors.find(isFatalError) ??
      (cached.length === 0 && matches.length === 0 ? errors[0] : undefined) ??
      null;
    return Object.freeze({
      selectedMatchIds: ids,
      cachedMatches: Object.freeze([...cached]),
      matches: Object.freeze([...matches]),
      errors: Object.freeze([...errors]),
      failure,
    });
  }

  /** @description 두 경기 묶음씩 조회하고 종료·외부 취소 신호를 진행 중 요청에 전달한다. 응답 완료 순서로 결과를 재정렬하지 않는다. */
  private async findMissingMatches(
    target: MatchCollectionTarget,
    ids: readonly string[],
    signal?: AbortSignal,
  ): Promise<Pick<FetchedMatchSelection, "matches" | "errors">> {
    const matches: PlayerMatch[] = [];
    const errors: MatchCollectionError[] = [];
    for (let start = 0; start < ids.length; start += CONCURRENT_MATCH_LIMIT) {
      if (signal?.aborted) {
        errors.push(aborted(signal));
        break;
      }
      const controller = new AbortController();
      const combined = signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal;
      const results = await Promise.all(
        ids
          .slice(start, start + CONCURRENT_MATCH_LIMIT)
          .map((id) => this.findMatch(target, id, combined, controller)),
      );
      for (const result of results) {
        if (Result.isFailure(result)) errors.push(result.error);
        else matches.push(result.value);
      }
      if (errors.some(isFatalError)) break;
    }
    return { matches, errors };
  }

  /** @description 대상이 다른 상세 결과는 저장 후보에서 제외하고 같은 묶음의 요청을 중단한다. */
  private async findMatch(
    target: MatchCollectionTarget,
    id: string,
    signal: AbortSignal,
    controller: AbortController,
  ): Promise<Result.Result<PlayerMatch, MatchCollectionError>> {
    if (signal.aborted) return Result.fail(aborted(signal));
    const result = await this.client.findPlayerMatch(id, target.puuid, signal);
    if (Result.isFailure(result)) {
      if (isFatalError(result.error)) controller.abort();
      return result;
    }
    const match = result.value;
    if (
      match.matchId !== id ||
      match.puuid !== target.puuid ||
      match.queueId !== target.queueId
    ) {
      controller.abort();
      return Result.fail(
        new MatchCollectionError({ reason: "INVALID_RESPONSE" }),
      );
    }
    return result;
  }
}

/** @description 원천 ID를 임의 보정하지 않고 빈 값·공백을 포함한 잘못된 식별자를 거부한다. */
function isMatchId(id: string): boolean {
  return typeof id === "string" && id.length > 0 && id === id.trim();
}

/** @description 기존 수집과 같은 중단 범위를 유지하며 429는 다른 오류 분류보다 우선한다. */
function isFatalError(error: MatchCollectionError): boolean {
  if (
    error.status === 429 ||
    error.retryAvailableAt ||
    error.reason === "CONFIGURATION" ||
    error.reason === "INVALID_RESPONSE"
  )
    return true;
  if (error.reason === "TIMEOUT" || error.reason === "REQUEST_FAILED")
    return false;
  return (
    error.reason !== "HTTP" ||
    (error.status !== 404 &&
      !(
        error.status !== undefined &&
        error.status >= 500 &&
        error.status < 600
      ))
  );
}

/** @description 취소는 원본 사유를 보존하고 호출자가 실행 권한 상실과 구분해 처리할 수 있게 한다. */
function aborted(signal: AbortSignal): MatchCollectionError {
  return new MatchCollectionError({
    reason: "REQUEST_FAILED",
    cause: signal.reason,
  });
}
