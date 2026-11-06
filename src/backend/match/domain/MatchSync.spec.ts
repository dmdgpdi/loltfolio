import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { MatchSyncNotInProgressError } from "./errors/MatchSyncNotInProgressError";
import { MatchSyncStartNotAllowedError } from "./errors/MatchSyncStartNotAllowedError";
import { MatchSync } from "./MatchSync";

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 29, 0, minutes));

it("최초 수집은 성공 기록 없이 시작할 수 있다", () => {
  // Arrange: 테스트 인자와 명시한 입력을 사용한다.

  // Act
  const sync = new MatchSync("player-puuid", 420);

  // Assert
  expect(sync.puuid).toBe("player-puuid");
  expect(sync.status).toBe("NOT_STARTED");
  expect(sync.lastAttemptAt).toBeNull();
  expect(sync.lastSucceededAt).toBeNull();
  expect(sync.retryAvailableAt).toBeNull();

  // Act
  const canStart = sync.canStart(at(0));

  // Assert
  expect(canStart).toBe(true);
});

it("수집을 시작하면 진행 상태와 시도 시각을 기록한다", () => {
  // Arrange
  const sync = new MatchSync("player-puuid", 420);

  // Act
  const startResult = sync.start(at(0));

  // Assert
  expect(startResult).toEqual(Result.succeed(undefined));

  expect(sync.status).toBe("IN_PROGRESS");
  expect(sync.lastAttemptAt).toEqual(at(0));
});

it("수집 중에는 시간이 지나도 중복 시작할 수 없다", () => {
  // Arrange
  const sync = new MatchSync("player-puuid", 420);
  Result.unwrap(sync.start(at(0)));

  // Act
  const result = sync.start(at(60));

  // Assert
  expect(result).toEqual(
    Result.fail(expect.any(MatchSyncStartNotAllowedError)),
  );

  // Act
  const canStart = sync.canStart(at(60));

  // Assert
  expect(canStart).toBe(false);
  expect(sync.lastAttemptAt).toEqual(at(0));
  expect(sync.status).toBe("IN_PROGRESS");
});

it.each([
  -1, 0, 1,
])("마지막 성공 후 20분 경계에서 %i ms 차이로 시작 가능 여부를 판단한다", (offset) => {
  // Arrange
  const sync = new MatchSync("player-puuid", 420);
  Result.unwrap(sync.start(at(0)));
  Result.unwrap(sync.succeed(at(2)));
  const now = new Date(at(22).getTime() + offset);

  // Act
  const canStart = sync.canStart(now);

  // Assert
  expect(canStart).toBe(offset >= 0);
});

it("성공 제한 중 시작 실패는 성공 상태와 기록을 변경하지 않는다", () => {
  // Arrange
  const sync = new MatchSync("player-puuid", 420);
  Result.unwrap(sync.start(at(0)));
  Result.unwrap(sync.succeed(at(2)));

  // Act
  const startResult = sync.start(at(21));

  // Assert
  expect(startResult).toEqual(
    Result.fail(expect.any(MatchSyncStartNotAllowedError)),
  );
  expect(sync.status).toBe("SUCCEEDED");
  expect(sync.lastAttemptAt).toEqual(at(0));
  expect(sync.lastSucceededAt).toEqual(at(2));
});

it("수집을 다시 시작하거나 실패해도 이전 성공 시각을 보존한다", () => {
  // Arrange
  const sync = new MatchSync("player-puuid", 420);
  Result.unwrap(sync.start(at(0)));
  Result.unwrap(sync.succeed(at(2)));

  // Act
  Result.unwrap(sync.start(at(22)));

  // Assert
  expect(sync.lastSucceededAt).toEqual(at(2));

  // Act
  const failureResult = sync.fail();

  // Assert
  expect(failureResult).toEqual(Result.succeed(undefined));

  expect(sync.status).toBe("FAILED");
  expect(sync.lastAttemptAt).toEqual(at(22));
  expect(sync.lastSucceededAt).toEqual(at(2));

  // Act
  const canStart = sync.canStart(at(22));

  // Assert
  expect(canStart).toBe(true);
});

it("성공 기록 없이 실패하면 20분을 기다리지 않고 재시도할 수 있다", () => {
  // Arrange
  const sync = new MatchSync("player-puuid", 420);
  Result.unwrap(sync.start(at(0)));

  // Act
  Result.unwrap(sync.fail());

  // Assert
  expect(sync.lastSucceededAt).toBeNull();

  // Act
  const canStart = sync.canStart(at(1));

  // Assert
  expect(canStart).toBe(true);
});

it.each([
  -1, 0, 1,
])("API 재시도 시각 경계에서 %i ms 차이로 시작 가능 여부를 판단한다", (offset) => {
  // Arrange
  const sync = new MatchSync("player-puuid", 420);
  Result.unwrap(sync.start(at(0)));

  // Act
  Result.unwrap(sync.fail(at(5)));

  // Assert
  expect(sync.retryAvailableAt).toEqual(at(5));

  // Act
  const canStart = sync.canStart(new Date(at(5).getTime() + offset));

  // Assert
  expect(canStart).toBe(offset >= 0);
});

it("성공 기반 제한과 API 재시도 제한을 모두 만족해야 시작한다", () => {
  // Arrange
  const sync = new MatchSync("player-puuid", 420);
  Result.unwrap(sync.start(at(0)));
  Result.unwrap(sync.succeed(at(0)));
  Result.unwrap(sync.start(at(20)));
  Result.unwrap(sync.fail(at(30)));

  // Act
  const startResult = sync.start(at(29));

  // Assert
  expect(startResult).toEqual(
    Result.fail(expect.any(MatchSyncStartNotAllowedError)),
  );
  expect(sync.lastAttemptAt).toEqual(at(20));

  // Act
  const canStart = sync.canStart(at(30));

  // Assert
  expect(canStart).toBe(true);
});

it("재시도에 성공하면 성공 시각을 갱신하고 API 재시도 제한을 해제한다", () => {
  // Arrange
  const sync = new MatchSync("player-puuid", 420);
  Result.unwrap(sync.start(at(0)));
  Result.unwrap(sync.fail(at(5)));
  Result.unwrap(sync.start(at(5)));

  // Act
  const successResult = sync.succeed(at(6));

  // Assert
  expect(successResult).toEqual(Result.succeed(undefined));

  expect(sync.status).toBe("SUCCEEDED");
  expect(sync.lastSucceededAt).toEqual(at(6));
  expect(sync.retryAvailableAt).toBeNull();

  // Act
  const canStart = sync.canStart(at(25));

  // Assert
  expect(canStart).toBe(false);
});

it.each([
  "NOT_STARTED",
  "SUCCEEDED",
  "FAILED",
] as const)("%s 상태에서는 성공 또는 실패로 완료할 수 없다", (status) => {
  // Arrange
  const sync = new MatchSync("player-puuid", 420);

  if (status !== "NOT_STARTED") {
    Result.unwrap(sync.start(at(0)));
    Result.unwrap(
      status === "SUCCEEDED" ? sync.succeed(at(1)) : sync.fail(at(5)),
    );
  }

  const previousSuccess = sync.lastSucceededAt;
  const previousRetry = sync.retryAvailableAt;

  // Act
  const successResult = sync.succeed(at(10));

  // Assert
  expect(successResult).toEqual(
    Result.fail(expect.any(MatchSyncNotInProgressError)),
  );

  // Act
  const failureResult = sync.fail(at(20));

  // Assert
  expect(failureResult).toEqual(
    Result.fail(expect.any(MatchSyncNotInProgressError)),
  );
  expect(sync.status).toBe(status);
  expect(sync.lastSucceededAt).toEqual(previousSuccess);
  expect(sync.retryAvailableAt).toEqual(previousRetry);
});

it("외부에서 Date를 수정해도 내부 수집 기록과 제한은 바뀌지 않는다", () => {
  // Arrange
  const sync = new MatchSync("player-puuid", 420);
  const startedAt = at(0);
  Result.unwrap(sync.start(startedAt));
  startedAt.setTime(at(50).getTime());
  sync.lastAttemptAt?.setTime(at(60).getTime());
  const retryAt = at(5);

  // Act
  Result.unwrap(sync.fail(retryAt));
  retryAt.setTime(at(0).getTime());
  sync.retryAvailableAt?.setTime(at(0).getTime());

  // Assert
  expect(sync.lastAttemptAt).toEqual(at(0));
  expect(sync.retryAvailableAt).toEqual(at(5));

  // Act
  const canStart = sync.canStart(at(1));

  // Assert
  expect(canStart).toBe(false);
});

it("복사본의 완료 상태가 원본 진행 상태를 변경하지 않는다", () => {
  // Arrange
  const original = new MatchSync("player-puuid", 420);
  Result.unwrap(original.start(at(0)));
  const completed = original.copy();

  // Act
  Result.unwrap(completed.succeed(at(1)));

  // Assert
  expect(original.status).toBe("IN_PROGRESS");
  expect(original.lastSucceededAt).toBeNull();
  expect(completed.status).toBe("SUCCEEDED");
  expect(completed.lastSucceededAt).toEqual(at(1));
});

it("복사할 때 플레이어와 큐 식별자를 모두 보존한다", () => {
  // Arrange: 테스트 인자와 명시한 입력을 사용한다.

  // Act
  const sync = new MatchSync("player-puuid", 440);

  const copy = sync.copy();

  // Assert
  expect(copy.puuid).toBe("player-puuid");
  expect(copy.queueId).toBe(440);
});

it("부분 성공도 최신화 시각과 20분 제한을 기록하되 완전 성공과 상태를 구분한다", () => {
  // Arrange
  const sync = new MatchSync("player", 420);
  Result.unwrap(sync.start(at(0)));

  // Act
  const result = sync.partiallySucceed(at(1));

  // Assert
  expect(result).toEqual(Result.succeed(undefined));
  expect(sync.status).toBe("PARTIALLY_SUCCEEDED");
  expect(sync.lastSucceededAt).toEqual(at(1));

  // Act
  const canStart = sync.canStart(at(20));

  // Assert
  expect(canStart).toBe(false);

  // Act
  const canStart2 = sync.canStart(at(21));

  // Assert
  expect(canStart2).toBe(true);
  expect(sync.copy().status).toBe("PARTIALLY_SUCCEEDED");
});

it("진행 중이 아니면 부분 성공으로 완료할 수 없다", () => {
  // Arrange: 테스트 인자와 명시한 입력을 사용한다.

  // Act
  const result = new MatchSync("player", 420).partiallySucceed(at(0));

  // Assert
  expect(result).toEqual(Result.fail(expect.any(MatchSyncNotInProgressError)));
});

it("부분 성공으로 완료된 작업을 다시 완료하거나 실패로 바꿀 수 없다", () => {
  // Arrange
  const sync = new MatchSync("player", 420);
  Result.unwrap(sync.start(at(0)));
  Result.unwrap(sync.partiallySucceed(at(1)));

  // Act
  const result = sync.partiallySucceed(at(2));

  // Assert
  expect(result).toEqual(Result.fail(expect.any(MatchSyncNotInProgressError)));

  // Act
  const successResult = sync.succeed(at(2));

  // Assert
  expect(successResult).toEqual(
    Result.fail(expect.any(MatchSyncNotInProgressError)),
  );

  // Act
  const failureResult = sync.fail();

  // Assert
  expect(failureResult).toEqual(
    Result.fail(expect.any(MatchSyncNotInProgressError)),
  );
});
