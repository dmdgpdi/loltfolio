import { Result } from "@praha/byethrow";
import type { MatchCollectionJobFailure } from "@/backend/match/domain/types/MatchCollectionJobFailure.type";
import { MatchCollectionAttemptError } from "./errors/MatchCollectionAttemptError";
import { MatchCollectionError } from "./errors/MatchCollectionError";
import type { MatchCollectionFetcher } from "./MatchCollectionFetcher";
import type { MatchCollectionSource } from "./MatchCollectionSource";
import type { CollectedMatchBatch } from "./types/CollectedMatchBatch.type";
import type { MatchCollectionTarget } from "./types/MatchCollectionTarget.type";

/** @description 공용 수집 결과를 작업 Application의 실패 분류·종료 결과로 변환하며 직접 저장하지 않는다. */
export class StoredMatchCollectionSource implements MatchCollectionSource {
  /** @description 저장·완료 동작이 없는 공용 수집 실행부를 주입한다. */
  constructor(private readonly fetcher: MatchCollectionFetcher) {}

  /** @description 최초 목록 요청의 일시적 장애만 복구 대상으로 분류하고 원본 오류를 보존한다. */
  async findSelection(
    target: MatchCollectionTarget,
    signal: AbortSignal,
  ): Promise<Result.Result<readonly string[], MatchCollectionAttemptError>> {
    const found = await this.fetcher.findRecentMatchIds(target, signal);
    return Result.isFailure(found)
      ? Result.fail(
          new MatchCollectionAttemptError({
            cause: found.error,
            failure: classify(found.error, true),
          }),
        )
      : found;
  }

  /** @description 캐시를 고려한 수집 결론과 신규 경기만 반환한다. 개별 오류를 작업 전체의 자동 복구로 바꾸지 않는다. */
  async collectSelection(
    target: MatchCollectionTarget,
    ids: readonly string[],
    signal: AbortSignal,
  ): Promise<Result.Result<CollectedMatchBatch, MatchCollectionAttemptError>> {
    const fetched = await this.fetcher.collectSelection(target, ids, signal);
    if (Result.isFailure(fetched)) {
      const failure =
        fetched.error instanceof MatchCollectionError
          ? classify(fetched.error, false)
          : ({ code: "COLLECTION_FAILED", retryAvailableAt: null } as const);
      return Result.fail(
        new MatchCollectionAttemptError({ cause: fetched.error, failure }),
      );
    }
    const selection = fetched.value;
    return Result.succeed(
      Object.freeze({
        matches: selection.matches,
        outcome: selection.failure
          ? Object.freeze({
              status: "FAILED",
              failure: classify(selection.failure, false),
            } as const)
          : Object.freeze({
              status:
                selection.errors.length > 0
                  ? "PARTIALLY_SUCCEEDED"
                  : "SUCCEEDED",
            } as const),
      }),
    );
  }
}

/** @description 목록 요청과 개별 경기 실패의 정책을 구분한다. 429·인증·설정·응답 오류는 자동 복구보다 우선한다. */
function classify(
  error: MatchCollectionError,
  isSelection: boolean,
): MatchCollectionJobFailure {
  if (error.status === 429)
    return Object.freeze({
      code: "RIOT_RATE_LIMITED",
      retryAvailableAt: error.retryAvailableAt
        ? new Date(error.retryAvailableAt)
        : null,
    });
  let code: MatchCollectionJobFailure["code"] = "COLLECTION_FAILED";
  if (error.reason === "CONFIGURATION") code = "CONFIGURATION_ERROR";
  else if (error.reason === "INVALID_RESPONSE") code = "INVALID_RESPONSE";
  else if (error.status === 401 || error.status === 403)
    code = "AUTHENTICATION_FAILED";
  else if (
    isSelection &&
    (error.reason === "TIMEOUT" ||
      error.reason === "REQUEST_FAILED" ||
      (error.reason === "HTTP" &&
        error.status !== undefined &&
        error.status >= 500 &&
        error.status < 600))
  )
    code = "TEMPORARY_FAILURE";
  return Object.freeze({ code, retryAvailableAt: null });
}
