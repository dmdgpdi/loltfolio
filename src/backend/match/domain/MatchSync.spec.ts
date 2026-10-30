import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { MatchSyncNotInProgressError } from "./errors/MatchSyncNotInProgressError";
import { MatchSyncStartNotAllowedError } from "./errors/MatchSyncStartNotAllowedError";
import { MatchSync } from "./MatchSync";

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 29, 0, minutes));

it("최초 수집은 성공 기록 없이 시작할 수 있다", () => {
  const sync = new MatchSync("player-puuid", 420);

  expect(sync.puuid).toBe("player-puuid");
  expect(sync.status).toBe("NOT_STARTED");
  expect(sync.lastAttemptAt).toBeNull();
  expect(sync.lastSucceededAt).toBeNull();
  expect(sync.retryAvailableAt).toBeNull();
  expect(sync.canStart(at(0))).toBe(true);
});

it("수집을 시작하면 진행 상태와 시도 시각을 기록한다", () => {
  const sync = new MatchSync("player-puuid", 420);

  expect(sync.start(at(0))).toEqual(Result.succeed(undefined));

  expect(sync.status).toBe("IN_PROGRESS");
  expect(sync.lastAttemptAt).toEqual(at(0));
});

it("수집 중에는 시간이 지나도 중복 시작할 수 없다", () => {
  const sync = new MatchSync("player-puuid", 420);
  Result.unwrap(sync.start(at(0)));

  const result = sync.start(at(60));

  expect(result).toEqual(
    Result.fail(expect.any(MatchSyncStartNotAllowedError)),
  );
  expect(sync.canStart(at(60))).toBe(false);
  expect(sync.lastAttemptAt).toEqual(at(0));
  expect(sync.status).toBe("IN_PROGRESS");
});

it.each([
  -1, 0, 1,
])("마지막 성공 후 20분 경계에서 %i ms 차이로 시작 가능 여부를 판단한다", (offset) => {
  const sync = new MatchSync("player-puuid", 420);
  Result.unwrap(sync.start(at(0)));
  Result.unwrap(sync.succeed(at(2)));
  const now = new Date(at(22).getTime() + offset);

  expect(sync.canStart(now)).toBe(offset >= 0);
});

it("성공 제한 중 시작 실패는 성공 상태와 기록을 변경하지 않는다", () => {
  const sync = new MatchSync("player-puuid", 420);
  Result.unwrap(sync.start(at(0)));
  Result.unwrap(sync.succeed(at(2)));

  expect(sync.start(at(21))).toEqual(
    Result.fail(expect.any(MatchSyncStartNotAllowedError)),
  );
  expect(sync.status).toBe("SUCCEEDED");
  expect(sync.lastAttemptAt).toEqual(at(0));
  expect(sync.lastSucceededAt).toEqual(at(2));
});

it("수집을 다시 시작하거나 실패해도 이전 성공 시각을 보존한다", () => {
  const sync = new MatchSync("player-puuid", 420);
  Result.unwrap(sync.start(at(0)));
  Result.unwrap(sync.succeed(at(2)));

  Result.unwrap(sync.start(at(22)));
  expect(sync.lastSucceededAt).toEqual(at(2));
  expect(sync.fail()).toEqual(Result.succeed(undefined));

  expect(sync.status).toBe("FAILED");
  expect(sync.lastAttemptAt).toEqual(at(22));
  expect(sync.lastSucceededAt).toEqual(at(2));
  expect(sync.canStart(at(22))).toBe(true);
});

it("성공 기록 없이 실패하면 20분을 기다리지 않고 재시도할 수 있다", () => {
  const sync = new MatchSync("player-puuid", 420);
  Result.unwrap(sync.start(at(0)));

  Result.unwrap(sync.fail());

  expect(sync.lastSucceededAt).toBeNull();
  expect(sync.canStart(at(1))).toBe(true);
});

it.each([
  -1, 0, 1,
])("API 재시도 시각 경계에서 %i ms 차이로 시작 가능 여부를 판단한다", (offset) => {
  const sync = new MatchSync("player-puuid", 420);
  Result.unwrap(sync.start(at(0)));
  Result.unwrap(sync.fail(at(5)));

  expect(sync.retryAvailableAt).toEqual(at(5));
  expect(sync.canStart(new Date(at(5).getTime() + offset))).toBe(offset >= 0);
});

it("성공 기반 제한과 API 재시도 제한을 모두 만족해야 시작한다", () => {
  const sync = new MatchSync("player-puuid", 420);
  Result.unwrap(sync.start(at(0)));
  Result.unwrap(sync.succeed(at(0)));
  Result.unwrap(sync.start(at(20)));
  Result.unwrap(sync.fail(at(30)));

  expect(sync.start(at(29))).toEqual(
    Result.fail(expect.any(MatchSyncStartNotAllowedError)),
  );
  expect(sync.lastAttemptAt).toEqual(at(20));
  expect(sync.canStart(at(30))).toBe(true);
});

it("재시도에 성공하면 성공 시각을 갱신하고 API 재시도 제한을 해제한다", () => {
  const sync = new MatchSync("player-puuid", 420);
  Result.unwrap(sync.start(at(0)));
  Result.unwrap(sync.fail(at(5)));
  Result.unwrap(sync.start(at(5)));

  expect(sync.succeed(at(6))).toEqual(Result.succeed(undefined));

  expect(sync.status).toBe("SUCCEEDED");
  expect(sync.lastSucceededAt).toEqual(at(6));
  expect(sync.retryAvailableAt).toBeNull();
  expect(sync.canStart(at(25))).toBe(false);
});

it.each([
  "NOT_STARTED",
  "SUCCEEDED",
  "FAILED",
] as const)("%s 상태에서는 성공 또는 실패로 완료할 수 없다", (status) => {
  const sync = new MatchSync("player-puuid", 420);
  if (status !== "NOT_STARTED") {
    Result.unwrap(sync.start(at(0)));
    Result.unwrap(
      status === "SUCCEEDED" ? sync.succeed(at(1)) : sync.fail(at(5)),
    );
  }
  const previousSuccess = sync.lastSucceededAt;
  const previousRetry = sync.retryAvailableAt;

  expect(sync.succeed(at(10))).toEqual(
    Result.fail(expect.any(MatchSyncNotInProgressError)),
  );
  expect(sync.fail(at(20))).toEqual(
    Result.fail(expect.any(MatchSyncNotInProgressError)),
  );
  expect(sync.status).toBe(status);
  expect(sync.lastSucceededAt).toEqual(previousSuccess);
  expect(sync.retryAvailableAt).toEqual(previousRetry);
});

it("외부에서 Date를 수정해도 내부 수집 기록과 제한은 바뀌지 않는다", () => {
  const sync = new MatchSync("player-puuid", 420);
  const startedAt = at(0);
  Result.unwrap(sync.start(startedAt));
  startedAt.setTime(at(50).getTime());
  sync.lastAttemptAt?.setTime(at(60).getTime());
  const retryAt = at(5);
  Result.unwrap(sync.fail(retryAt));
  retryAt.setTime(at(0).getTime());
  sync.retryAvailableAt?.setTime(at(0).getTime());

  expect(sync.lastAttemptAt).toEqual(at(0));
  expect(sync.retryAvailableAt).toEqual(at(5));
  expect(sync.canStart(at(1))).toBe(false);
});

it("복사본의 완료 상태가 원본 진행 상태를 변경하지 않는다", () => {
  const original = new MatchSync("player-puuid", 420);
  Result.unwrap(original.start(at(0)));
  const completed = original.copy();

  Result.unwrap(completed.succeed(at(1)));

  expect(original.status).toBe("IN_PROGRESS");
  expect(original.lastSucceededAt).toBeNull();
  expect(completed.status).toBe("SUCCEEDED");
  expect(completed.lastSucceededAt).toEqual(at(1));
});

it("복사할 때 플레이어와 큐 식별자를 모두 보존한다", () => {
  const sync = new MatchSync("player-puuid", 440);

  const copy = sync.copy();

  expect(copy.puuid).toBe("player-puuid");
  expect(copy.queueId).toBe(440);
});
