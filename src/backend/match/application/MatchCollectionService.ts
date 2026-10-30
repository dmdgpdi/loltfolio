import { Result } from "@praha/byethrow";
import type { MatchRepositoryError } from "../domain/errors/MatchRepositoryError";
import type { MatchSyncNotInProgressError } from "../domain/errors/MatchSyncNotInProgressError";
import type { MatchSyncStartNotAllowedError } from "../domain/errors/MatchSyncStartNotAllowedError";
import type { MatchSync } from "../domain/MatchSync";
import type { PlayerMatch } from "../domain/PlayerMatch";
import type { MatchSyncRepository } from "../domain/types/MatchSyncRepository.type";
import type { PlayerMatchRepository } from "../domain/types/PlayerMatchRepository.type";
import type { QueueId } from "../domain/types/QueueId.type";
import { MatchCollectionError } from "./errors/MatchCollectionError";
import { MatchCollectionFailureSaveError } from "./errors/MatchCollectionFailureSaveError";
import type { RiotMatchClient } from "./RiotMatchClient";

type MatchCollectionFailure =
  | MatchCollectionError
  | MatchRepositoryError
  | MatchSyncStartNotAllowedError
  | MatchSyncNotInProgressError
  | MatchCollectionFailureSaveError;

const RECENT_MATCH_LIMIT = 20;

export class MatchCollectionService {
  constructor(
    private readonly syncRepository: MatchSyncRepository,
    private readonly matchRepository: PlayerMatchRepository,
    private readonly riotMatchClient: RiotMatchClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** @description 지원하는 큐의 최근 유효 경기를 수집하며 큐별 중복 실행·최신화 제한을 적용한다. */
  async collectRecentMatches(
    puuid: string,
    queueId: QueueId,
  ): Promise<Result.Result<readonly PlayerMatch[], MatchCollectionFailure>> {
    const started = await this.syncRepository.tryStart(
      puuid,
      queueId,
      this.now(),
    );
    if (Result.isFailure(started)) {
      return started;
    }

    const sync = started.value;
    const collected = await this.collect(puuid, queueId);

    if (Result.isFailure(collected)) {
      return this.recordFailure(sync, collected.error);
    }

    // 성공 상태 저장에 실패해도 원래 IN_PROGRESS 객체로 실패를 기록할 수 있다.
    const completed = sync.copy();
    const succeeded = completed.succeed(this.now());

    if (Result.isFailure(succeeded)) {
      return this.recordFailure(sync, succeeded.error);
    }

    const saved = await this.syncRepository.update(completed);

    if (Result.isFailure(saved)) {
      return this.recordFailure(sync, saved.error);
    }

    return collected;
  }

  /** @description 같은 큐의 저장 기록을 재사용하고 신규 상세만 조회해 최대 20개의 유효 경기를 확보한다. */
  private async collect(
    puuid: string,
    queueId: QueueId,
  ): Promise<
    Result.Result<
      readonly PlayerMatch[],
      MatchCollectionError | MatchRepositoryError
    >
  > {
    const selected: PlayerMatch[] = [];
    const newMatches: PlayerMatch[] = [];
    const seen = new Set<string>();
    let start = 0;

    while (selected.length < RECENT_MATCH_LIMIT) {
      const page = await this.riotMatchClient.findRecentMatchIds(
        puuid,
        queueId,
        RECENT_MATCH_LIMIT,
        start,
      );

      if (Result.isFailure(page)) {
        return page;
      }

      const pageIds = page.value.slice(0, RECENT_MATCH_LIMIT);
      const ids = [...new Set(pageIds)].filter((id) => !seen.has(id));
      if (ids.length === 0) break;
      const existing = await this.matchRepository.findByMatchIds(
        puuid,
        queueId,
        ids,
      );
      if (Result.isFailure(existing)) return existing;
      const cached = new Map(
        existing.value
          .filter((match) => match.puuid === puuid && match.queueId === queueId)
          .map((match) => [match.matchId, match]),
      );

      for (const matchId of ids) {
        seen.add(matchId);
        let match = cached.get(matchId);
        if (!match) {
          const detail = await this.riotMatchClient.findPlayerMatch(
            matchId,
            puuid,
          );
          if (Result.isFailure(detail)) return detail;
          match = detail.value;
          if (
            match.matchId !== matchId ||
            match.puuid !== puuid ||
            match.queueId !== queueId
          ) {
            return Result.fail(
              new MatchCollectionError({ reason: "INVALID_RESPONSE" }),
            );
          }
          // 제외 경기의 판정 정보도 저장해 다음 수집에서 상세 호출을 반복하지 않는다.
          newMatches.push(match);
        }
        if (match.isEligibleForAnalysis()) selected.push(match);
        if (selected.length === RECENT_MATCH_LIMIT) break;
      }
      start += pageIds.length;
      if (pageIds.length < RECENT_MATCH_LIMIT) break;
    }

    if (newMatches.length > 0) {
      const saved = await this.matchRepository.saveAll(newMatches);
      if (Result.isFailure(saved)) return saved;
    }
    // Riot 목록의 최근 순서를 유지하며, 기록이 부족하면 확보한 유효 경기만 반환한다.
    return Result.succeed(selected);
  }

  private async recordFailure(
    sync: MatchSync,
    error:
      | MatchCollectionError
      | MatchRepositoryError
      | MatchSyncNotInProgressError,
  ): Promise<Result.Result<never, MatchCollectionFailure>> {
    const failed = sync.fail(
      error instanceof MatchCollectionError
        ? error.retryAvailableAt
        : undefined,
    );
    if (Result.isFailure(failed)) return failed;
    const saved = await this.syncRepository.update(sync);
    if (Result.isFailure(saved)) {
      return Result.fail(
        new MatchCollectionFailureSaveError({
          cause: error,
          saveError: saved.error,
        }),
      );
    }
    return Result.fail(error);
  }
}
