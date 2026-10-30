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
/** @description 두 경기씩 시작해 병렬 처리하면서 중단 시 진행 중인 요청 수를 작게 제한한다. Riot의 시간 구간별 호출 한도를 의미하지 않는다. */
const CONCURRENT_MATCH_LIMIT = 2;

/** @description 이번 목록에서 확보한 기록과 개별 조회 오류. 성공분은 중단 오류가 있어도 저장한다. */
type FetchedMatches = Readonly<{
  matches: readonly PlayerMatch[];
  errors: readonly MatchCollectionError[];
}>;
/** @description 확보된 분석 대상과 일부 실패 여부를 함께 전달해 완전 성공과 부분 성공을 구분한다. */
type CollectedMatches = Readonly<{
  matches: readonly PlayerMatch[];
  hadFailures: boolean;
}>;

export class MatchCollectionService {
  constructor(
    private readonly syncRepository: MatchSyncRepository,
    private readonly matchRepository: PlayerMatchRepository,
    private readonly riotMatchClient: RiotMatchClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

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
      ? completed.partiallySucceed(this.now())
      : completed.succeed(this.now());

    if (Result.isFailure(succeeded)) {
      return this.recordFailure(sync, succeeded.error);
    }

    const saved = await this.syncRepository.update(completed);

    if (Result.isFailure(saved)) {
      return this.recordFailure(sync, saved.error);
    }

    return Result.succeed(collected.value.matches);
  }

  /** @description 최근 ID 한 페이지의 중복을 제거한다. 유효 기록 수를 맞추기 위한 과거 페이지 조회는 하지 않는다. */
  private async findRecentMatchIds(
    puuid: string,
    queueId: QueueId,
  ): Promise<Result.Result<readonly string[], MatchCollectionError>> {
    const page = await this.riotMatchClient.findRecentMatchIds(
      puuid,
      queueId,
      RECENT_MATCH_LIMIT,
      0,
    );
    return Result.pipe(
      page,
      Result.map((ids) => [...new Set(ids.slice(0, RECENT_MATCH_LIMIT))]),
    );
  }

  /** @description 최근 목록의 DB 기록을 재사용하고 없는 경기만 조회한다. 조회 성공분은 저장하고 오류의 범위에 따라 부분 성공 또는 실패로 마친다. */
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
    const ids = await this.findRecentMatchIds(puuid, queueId);
    if (Result.isFailure(ids)) return ids;
    if (ids.value.length === 0)
      return Result.succeed({ matches: [], hadFailures: false });
    const existing = await this.matchRepository.findByMatchIds(
      puuid,
      queueId,
      ids.value,
    );
    if (Result.isFailure(existing)) return existing;
    const cached = new Map(
      existing.value
        .filter((match) => match.puuid === puuid && match.queueId === queueId)
        .map((match) => [match.matchId, match]),
    );
    const missingIds = ids.value.filter((id) => !cached.has(id));
    const fetched = await this.findMissingMatches(missingIds, puuid, queueId);
    const fatal =
      fetched.errors.find((error) => error.status === 429) ??
      fetched.errors.find((error) => this.isFatalError(error));
    if (fetched.matches.length > 0) {
      const saved = await this.matchRepository.saveAll(fetched.matches);
      if (Result.isFailure(saved)) {
        // 실패 상태를 기록할 때도 API 재시도 제한은 유지해야 한다.
        return fatal
          ? Result.fail(
              new MatchCollectionFailureSaveError({
                cause: fatal,
                saveError: saved.error,
              }),
            )
          : saved;
      }
    }
    if (fatal) return Result.fail(fatal);
    for (const match of fetched.matches) cached.set(match.matchId, match);
    if (!ids.value.some((id) => cached.has(id)) && fetched.errors.length > 0)
      return Result.fail(fetched.errors[0]);
    const matches = ids.value.flatMap((id) => {
      const match = cached.get(id);
      return match?.isEligibleForAnalysis() ? [match] : [];
    });
    return Result.succeed({ matches, hadFailures: fetched.errors.length > 0 });
  }

  /** @description 누락 경기들을 두 개씩 병렬 조회한다. 응답 순서는 ID 순서로 보존하며 중단 오류 발생 시 진행 중 요청을 취소하고 다음 묶음을 시작하지 않는다. */
  private async findMissingMatches(
    ids: readonly string[],
    puuid: string,
    queueId: QueueId,
  ): Promise<FetchedMatches> {
    const matches: PlayerMatch[] = [];
    const errors: MatchCollectionError[] = [];
    for (let start = 0; start < ids.length; start += CONCURRENT_MATCH_LIMIT) {
      const controller = new AbortController();
      const results = await Promise.all(
        ids.slice(start, start + CONCURRENT_MATCH_LIMIT).map(async (id) => {
          const result = await this.riotMatchClient.findPlayerMatch(
            id,
            puuid,
            controller.signal,
          );
          if (Result.isFailure(result)) {
            if (this.isFatalError(result.error)) controller.abort();
            return result;
          }
          const match = result.value;
          if (
            match.matchId !== id ||
            match.puuid !== puuid ||
            match.queueId !== queueId
          ) {
            controller.abort();
            return Result.fail(
              new MatchCollectionError({ reason: "INVALID_RESPONSE" }),
            );
          }
          return result;
        }),
      );
      for (const result of results) {
        if (Result.isFailure(result)) errors.push(result.error);
        else matches.push(result.value);
      }
      if (errors.some((error) => this.isFatalError(error))) break;
    }
    return { matches, errors };
  }

  /** @description 개별 404·서버 오류·통신 실패는 건너뛰되 인증·설정·응답 검증·호출 제한 오류는 전체 수집을 중단한다. */
  private isFatalError(error: MatchCollectionError): boolean {
    if (
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

  /** @description 중단 오류와 DB 실패를 수집 상태에 기록하며 API 재시도 가능 시각을 보존한다. */
  private async recordFailure(
    sync: MatchSync,
    error:
      | MatchCollectionError
      | MatchRepositoryError
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
