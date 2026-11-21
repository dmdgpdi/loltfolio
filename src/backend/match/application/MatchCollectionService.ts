import { Result } from "@praha/byethrow";
import type { InvalidMatchSelectionError } from "@/backend/match/domain/errors/InvalidMatchSelectionError";
import type { MatchRepositoryError } from "@/backend/match/domain/errors/MatchRepositoryError";
import type { MatchSyncNotInProgressError } from "@/backend/match/domain/errors/MatchSyncNotInProgressError";
import type { MatchSyncStartNotAllowedError } from "@/backend/match/domain/errors/MatchSyncStartNotAllowedError";
import type { MatchSync } from "@/backend/match/domain/MatchSync";
import type { PlayerMatch } from "@/backend/match/domain/PlayerMatch";
import type { MatchSyncRepository } from "@/backend/match/domain/types/MatchSyncRepository.type";
import type { PlayerMatchRepository } from "@/backend/match/domain/types/PlayerMatchRepository.type";
import type { QueueId } from "@/backend/match/domain/types/QueueId.type";
import { MatchCollectionError } from "./errors/MatchCollectionError";
import { MatchCollectionFailureSaveError } from "./errors/MatchCollectionFailureSaveError";
import { MatchCollectionFetcher } from "./MatchCollectionFetcher";
import type { RiotMatchClient } from "./RiotMatchClient";

type MatchCollectionFailure =
  | InvalidMatchSelectionError
  | MatchCollectionError
  | MatchRepositoryError
  | MatchSyncStartNotAllowedError
  | MatchSyncNotInProgressError
  | MatchCollectionFailureSaveError;

/** @description 확보된 분석 대상과 일부 실패 여부를 함께 전달해 완전 성공과 부분 성공을 구분한다. */
type CollectedMatches = Readonly<{
  selectedMatchIds: readonly string[];
  matches: readonly PlayerMatch[];
  hadFailures: boolean;
}>;

/** @description 기존 동기 수집의 시작·저장·완료 계약을 유지하며 읽기 알고리즘은 작업 기반 수집과 공유한다. */
export class MatchCollectionService {
  private readonly fetcher: MatchCollectionFetcher;

  /** @description 기존 의존성으로 공용 읽기 실행부를 구성하고 저장·완료 경계는 이 서비스에 유지한다. */
  constructor(
    private readonly syncRepository: MatchSyncRepository,
    private readonly matchRepository: PlayerMatchRepository,
    riotMatchClient: RiotMatchClient,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.fetcher = new MatchCollectionFetcher(matchRepository, riotMatchClient);
  }

  /** @description 지원하는 큐의 최근 최대 20개 ID에서 확보 가능한 유효 경기를 수집한다. 일부 조회 실패는 부분 성공으로 기록하며 큐별 중복 실행·최신화 제한을 적용한다. */
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
    const succeeded = collected.value.hadFailures
      ? completed.partiallySucceed(this.now(), collected.value.selectedMatchIds)
      : completed.succeed(this.now(), collected.value.selectedMatchIds);

    if (Result.isFailure(succeeded)) {
      return this.recordFailure(sync, succeeded.error);
    }

    const saved = await this.syncRepository.update(completed);

    if (Result.isFailure(saved)) {
      return this.recordFailure(sync, saved.error);
    }

    return Result.succeed(collected.value.matches);
  }

  /** @description 공용 실행부의 확보 기록을 저장한 뒤 기존 오류·완료 표본 계약을 유지한다. */
  private async collect(
    puuid: string,
    queueId: QueueId,
  ): Promise<
    Result.Result<
      CollectedMatches,
      | MatchCollectionError
      | MatchRepositoryError
      | MatchCollectionFailureSaveError
    >
  > {
    const target = { puuid, queueId };
    const ids = await this.fetcher.findRecentMatchIds(target);
    if (Result.isFailure(ids)) return ids;
    const fetched = await this.fetcher.collectSelection(target, ids.value);
    if (Result.isFailure(fetched)) return fetched;
    const { matches, cachedMatches, failure, errors, selectedMatchIds } =
      fetched.value;
    if (matches.length > 0) {
      const saved = await this.matchRepository.saveAll(matches);
      if (Result.isFailure(saved)) {
        return failure
          ? Result.fail(
              new MatchCollectionFailureSaveError({
                cause: failure,
                saveError: saved.error,
              }),
            )
          : saved;
      }
    }
    if (failure) return Result.fail(failure);
    const available = new Map(
      [...cachedMatches, ...matches].map((match) => [match.matchId, match]),
    );
    return Result.succeed({
      selectedMatchIds,
      matches: selectedMatchIds.flatMap((id) => {
        const match = available.get(id);
        return match?.isEligibleForAnalysis() ? [match] : [];
      }),
      hadFailures: errors.length > 0,
    });
  }

  /** @description 중단 오류와 DB 실패를 수집 상태에 기록하며 API 재시도 가능 시각을 보존한다. */
  private async recordFailure(
    sync: MatchSync,
    error:
      | MatchCollectionError
      | MatchRepositoryError
      | InvalidMatchSelectionError
      | MatchSyncNotInProgressError
      | MatchCollectionFailureSaveError,
  ): Promise<Result.Result<never, MatchCollectionFailure>> {
    const apiError =
      error instanceof MatchCollectionError
        ? error
        : error.cause instanceof MatchCollectionError
          ? error.cause
          : undefined;
    const failed = sync.fail(apiError?.retryAvailableAt);

    if (Result.isFailure(failed)) {
      return failed;
    }

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
