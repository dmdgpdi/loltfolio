import { Result } from "@praha/byethrow";
import { MatchSyncNotInProgressError } from "./errors/MatchSyncNotInProgressError";
import { MatchSyncStartNotAllowedError } from "./errors/MatchSyncStartNotAllowedError";
import { MATCH_SYNC_SUCCESS_COOLDOWN_MS } from "./MATCH_SYNC_SUCCESS_COOLDOWN_MS";
import type { MatchSyncData } from "./types/MatchSyncData.type";
import type { MatchSyncStatus } from "./types/MatchSyncStatus.type";
import type { QueueId } from "./types/QueueId.type";

/** @description 플레이어·큐별 경기 수집의 시작과 완료를 관리한다. 중복 진행, 성공 후 20분 대기, API 재시도 시각을 함께 적용한다. */
export class MatchSync {
  /** @description 현재 수집 작업의 상태. 초기 상태는 수집 이력이 없는 NOT_STARTED다. */
  private currentStatus: MatchSyncStatus = "NOT_STARTED";
  // 외부 Date 변경으로 수집 제한이 바뀌지 않도록 시각은 밀리초로 보관한다.

  /**
   * @description 마지막 수집 시도 시점
   */
  private attemptedAt: number | null = null;

  /**
   * @description 마지막으로 성공한 경기 수집 시점
   */
  private succeededAt: number | null = null;

  /**
   * @description API 제한·재시도 정책에 따라 재시도가 가능한 가장 빠른 시점(필요 시)
   */
  private retryAt: number | null = null;

  /** @description puuid로 수집 대상 플레이어를, queueId로 수집할 매칭 종류를 구분한다. */
  constructor(
    readonly puuid: string,
    readonly queueId: QueueId,
  ) {}

  /** @description 저장된 상태와 시각을 복원한다. Date는 밀리초 값으로 복사하여 저장 데이터와 참조를 공유하지 않는다. */
  static restore(data: MatchSyncData): MatchSync {
    const sync = new MatchSync(data.puuid, data.queueId);
    sync.currentStatus = data.status;
    sync.attemptedAt = data.lastAttemptAt?.getTime() ?? null;
    sync.succeededAt = data.lastSucceededAt?.getTime() ?? null;
    sync.retryAt = data.retryAvailableAt?.getTime() ?? null;
    return sync;
  }

  /** @description 완료 상태 저장 실패 시 원래 진행 객체로 실패 처리할 수 있도록 독립적인 수집 상태 복사본을 만든다. */
  copy(): MatchSync {
    const copy = new MatchSync(this.puuid, this.queueId);
    copy.currentStatus = this.currentStatus;
    copy.attemptedAt = this.attemptedAt;
    copy.succeededAt = this.succeededAt;
    copy.retryAt = this.retryAt;
    return copy;
  }

  /** @description 경기 수집의 현재 진행 상태. 경기의 승패나 종료 상태와는 별개다. */
  get status(): MatchSyncStatus {
    return this.currentStatus;
  }

  /** @description 마지막 수집을 시작한 절대 시각. 시도 기록이 없으면 null이다. 반환 Date는 복사본이다. */
  get lastAttemptAt(): Date | null {
    return this.attemptedAt === null ? null : new Date(this.attemptedAt);
  }

  /** @description 마지막 수집 성공 시각. 실패해도 보존하며, 이 시각부터 20분간 새 수집을 제한한다. 반환 Date는 복사본이다. */
  get lastSucceededAt(): Date | null {
    return this.succeededAt === null ? null : new Date(this.succeededAt);
  }

  /** @description API 제한으로 재시도가 가능해지는 절대 시각. null은 별도 API 대기 제한이 없다는 뜻이다. 반환 Date는 복사본이다. */
  get retryAvailableAt(): Date | null {
    return this.retryAt === null ? null : new Date(this.retryAt);
  }

  /** @description 진행 중이 아니고 성공 대기 시간과 API 재시도 제한이 모두 지난 경우 시작을 허용한다. 제한 시각과 같은 순간부터 가능하다. */
  canStart(now: Date): boolean {
    const time = now.getTime();

    const isNotInProgress = this.currentStatus !== "IN_PROGRESS";
    const hasSuccessCooldownElapsed =
      this.succeededAt === null ||
      time >= this.succeededAt + MATCH_SYNC_SUCCESS_COOLDOWN_MS;
    const isRetryAllowed = this.retryAt === null || time >= this.retryAt;

    return isNotInProgress && hasSuccessCooldownElapsed && isRetryAllowed;
  }

  /** @description 시작 가능한 경우에만 진행 상태와 시도 시각을 갱신한다. 거부 시 기존 상태와 기록을 보존한다. */
  start(now: Date): Result.Result<void, MatchSyncStartNotAllowedError> {
    if (!this.canStart(now)) {
      return Result.fail(new MatchSyncStartNotAllowedError());
    }

    this.currentStatus = "IN_PROGRESS";
    this.attemptedAt = now.getTime();

    return Result.succeed(undefined);
  }

  /** @description 진행 중인 경기 수집의 성공 시각을 기록하고 API 재시도 제한을 해제한다. 분석·리포트 저장 성공을 뜻하지 않는다. */
  succeed(now: Date): Result.Result<void, MatchSyncNotInProgressError> {
    if (this.currentStatus !== "IN_PROGRESS") {
      return Result.fail(new MatchSyncNotInProgressError());
    }

    this.currentStatus = "SUCCEEDED";
    this.succeededAt = now.getTime();
    this.retryAt = null;

    return Result.succeed(undefined);
  }

  /** @description 일부 경기 조회가 실패한 최신화를 부분 성공으로 기록한다. 성공분은 확보되었으므로 20분 제한을 적용하고 완전 성공과 구분한다. */
  partiallySucceed(
    now: Date,
  ): Result.Result<void, MatchSyncNotInProgressError> {
    const completed = this.succeed(now);
    if (Result.isFailure(completed)) return completed;
    this.currentStatus = "PARTIALLY_SUCCEEDED";
    return completed;
  }

  /** @description 진행 중인 수집을 실패로 마친다. 과거 성공 시각은 보존하고, 전달된 API 재시도 가능 시각은 별도로 기록한다. */
  fail(
    retryAvailableAt?: Date,
  ): Result.Result<void, MatchSyncNotInProgressError> {
    if (this.currentStatus !== "IN_PROGRESS") {
      return Result.fail(new MatchSyncNotInProgressError());
    }

    this.currentStatus = "FAILED";
    this.retryAt = retryAvailableAt?.getTime() ?? null;

    return Result.succeed(undefined);
  }
}
