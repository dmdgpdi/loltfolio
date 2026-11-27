import { Result } from "@praha/byethrow";
import { afterEach, expect, it, vi } from "vitest";
import { MatchCollectionAttemptError } from "@/backend/match/application/errors/MatchCollectionAttemptError";
import { MatchCollectionJobPersistenceError } from "@/backend/match/application/errors/MatchCollectionJobPersistenceError";
import { MatchCollectionLeaseLostError } from "@/backend/match/application/errors/MatchCollectionLeaseLostError";
import { MatchCollectionOutcomeSaveError } from "@/backend/match/application/errors/MatchCollectionOutcomeSaveError";
import { FinalizeMatchCollection } from "@/backend/match/application/FinalizeMatchCollection";
import type { MatchCollectionSource } from "@/backend/match/application/MatchCollectionSource";
import { RunMatchCollection } from "@/backend/match/application/RunMatchCollection";
import { MemoryMatchCollectionJobs } from "@/backend/match/testing/MemoryMatchCollectionJobs";
import { MatchCollectionWorker } from "./MatchCollectionWorker";

const settings = {
  leaseDurationMs: 10000,
  heartbeatIntervalMs: 10,
  retryDelayMs: 20,
  idlePollIntervalMs: 30,
  maxAttempts: 2,
};
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("접수된 작업을 실제 Application으로 수집·확정한 뒤 종료한다", async () => {
  const store = new MemoryMatchCollectionJobs();
  Result.unwrap(await store.admit({ puuid: "player", queueId: 420 }, 2));
  const stop = new AbortController();
  const finish = store.finish.bind(store);
  vi.spyOn(store, "finish").mockImplementation(async (lease) => {
    const result = await finish(lease);
    stop.abort();
    return result;
  });
  const source = emptySource();
  const select = vi.spyOn(source, "findSelection");
  await worker(store, source).run(stop.signal);
  expect(store.jobs.get("job-1")?.snapshot.status).toBe("SUCCEEDED");
  expect(select).toHaveBeenCalledTimes(1);
});

it("종료 권한 발급과 이전 토큰 갱신이 겹쳐도 새 권한으로 완료한다", async () => {
  vi.useFakeTimers();
  const store = new MemoryMatchCollectionJobs();
  Result.unwrap(await store.admit({ puuid: "player", queueId: 420 }, 2));
  const record = store.recordOutcome.bind(store);
  vi.spyOn(store, "recordOutcome").mockImplementation(async (...args) => {
    const result = await record(...args);
    await new Promise<void>((resolve) => setTimeout(resolve, 15));
    return result;
  });
  const stop = new AbortController();
  const running = worker(store).run(stop.signal);
  await vi.advanceTimersByTimeAsync(16);
  stop.abort();
  await running;

  expect(store.jobs.get("job-1")?.snapshot.status).toBe("SUCCEEDED");
});

it("대기 중 종료 신호를 받으면 새 작업을 선점하지 않고 끝낸다", async () => {
  vi.useFakeTimers();
  const store = new MemoryMatchCollectionJobs();
  const claim = vi.spyOn(store, "claimNext");
  const stop = new AbortController();
  const running = worker(store).run(stop.signal);
  await vi.advanceTimersByTimeAsync(1);
  stop.abort();
  await running;
  expect(claim).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("수집 중 주기적으로 갱신하며 종료 신호를 외부 요청에 전파한다", async () => {
  vi.useFakeTimers();
  const store = new MemoryMatchCollectionJobs();
  Result.unwrap(await store.admit({ puuid: "player", queueId: 420 }, 2));
  const stop = new AbortController();
  const renew = vi.spyOn(store, "renew");
  let cancelled = false;
  const source = emptySource();
  source.findSelection = async (_target, signal) =>
    new Promise((resolve) => {
      signal.addEventListener(
        "abort",
        () => {
          cancelled = true;
          resolve(Result.succeed([]));
        },
        { once: true },
      );
    });
  const running = worker(store, source).run(stop.signal);
  await vi.advanceTimersByTimeAsync(25);
  expect(renew.mock.calls.length).toBeGreaterThanOrEqual(3);
  stop.abort();
  await running;
  expect(cancelled).toBe(true);
  expect(store.jobs.get("job-1")?.snapshot.status).toBe("RUNNING");
  expect(vi.getTimerCount()).toBe(0);
});

it("heartbeat 권한 상실은 요청을 취소하고 종료 결과를 임의로 기록하지 않는다", async () => {
  vi.useFakeTimers();
  const store = new MemoryMatchCollectionJobs();
  Result.unwrap(await store.admit({ puuid: "player", queueId: 420 }, 2));
  const stop = new AbortController();
  let cancelled = false;
  const source = emptySource();
  source.findSelection = async (_target, signal) =>
    new Promise((resolve) => {
      store.renewError = new MatchCollectionLeaseLostError();
      signal.addEventListener(
        "abort",
        () => {
          cancelled = true;
          stop.abort();
          resolve(Result.succeed([]));
        },
        { once: true },
      );
    });
  const running = worker(store, source).run(stop.signal);
  await vi.advanceTimersByTimeAsync(20);
  await running;
  expect(cancelled).toBe(true);
  expect(store.jobs.get("job-1")?.snapshot.outcome).toBeNull();
});

it("관측한 결과의 저장이 실패하면 수집하지 않고 같은 결과 기록만 재시도한다", async () => {
  vi.useFakeTimers();
  const store = new MemoryMatchCollectionJobs();
  Result.unwrap(await store.admit({ puuid: "player", queueId: 420 }, 2));
  store.outcomeError = new MatchCollectionJobPersistenceError({
    retryable: true,
  });
  const stop = new AbortController();
  const source = emptySource();
  const selection = vi.spyOn(source, "findSelection");
  const finish = store.finish.bind(store);
  vi.spyOn(store, "finish").mockImplementation(async (lease) => {
    const result = await finish(lease);
    stop.abort();
    return result;
  });
  const running = worker(store, source).run(stop.signal);
  await vi.advanceTimersByTimeAsync(1);
  store.outcomeError = null;
  await vi.advanceTimersByTimeAsync(30);
  await running;
  expect(selection).toHaveBeenCalledTimes(1);
  expect(store.jobs.get("job-1")?.snapshot.status).toBe("SUCCEEDED");
});

it("완료 커밋 응답 유실은 같은 작업의 완료만 재확인한다", async () => {
  vi.useFakeTimers();
  const store = new MemoryMatchCollectionJobs();
  Result.unwrap(await store.admit({ puuid: "player", queueId: 420 }, 2));
  const stop = new AbortController();
  const finish = store.finish.bind(store);
  let calls = 0;
  vi.spyOn(store, "finish").mockImplementation(async (lease) => {
    calls++;
    const result = await finish(lease);
    if (calls === 1)
      return Result.fail(
        new MatchCollectionJobPersistenceError({ retryable: true }),
      );
    stop.abort();
    return result;
  });
  const find = store.findById.bind(store);
  const read = vi.spyOn(store, "findById").mockImplementation(async (jobId) => {
    const result = await find(jobId);
    if (Result.isSuccess(result) && result.value?.job.finishedAt) stop.abort();
    return result;
  });
  const source = emptySource();
  const selection = vi.spyOn(source, "findSelection");
  const running = worker(store, source).run(stop.signal);
  await vi.advanceTimersByTimeAsync(25);
  await running;
  expect(calls).toBe(1);
  expect(read).toHaveBeenCalled();
  expect(selection).toHaveBeenCalledTimes(1);
  expect(store.jobs.get("job-1")?.snapshot.status).toBe("SUCCEEDED");
});

it("429 기록 커밋 응답이 유실되면 조회로 확인하고 다음 선점은 종료만 수행한다", async () => {
  const store = new MemoryMatchCollectionJobs();
  Result.unwrap(await store.admit({ puuid: "player", queueId: 420 }, 2));
  store.outcomeCommitError = new MatchCollectionJobPersistenceError({
    retryable: true,
  });
  const firstStop = new AbortController();
  const source = emptySource();
  source.findSelection = async () =>
    Result.fail(
      new MatchCollectionAttemptError({
        failure: {
          code: "RIOT_RATE_LIMITED",
          retryAvailableAt: new Date(50000),
        },
      }),
    );
  const selection = vi.spyOn(source, "findSelection");
  const read = store.findById.bind(store);
  vi.spyOn(store, "findById").mockImplementation(async (jobId) => {
    const result = await read(jobId);
    firstStop.abort();
    return result;
  });
  await worker(store, source).run(firstStop.signal);
  expect(store.jobs.get("job-1")?.snapshot.status).toBe("FINALIZING");
  expect(selection).toHaveBeenCalledTimes(1);
  store.now = new Date(20000);
  const secondStop = new AbortController();
  const finish = store.finish.bind(store);
  vi.spyOn(store, "finish").mockImplementation(async (lease) => {
    const result = await finish(lease);
    secondStop.abort();
    return result;
  });
  await worker(store, source).run(secondStop.signal);
  expect(selection).toHaveBeenCalledTimes(1);
  expect(store.jobs.get("job-1")?.snapshot).toMatchObject({
    status: "FAILED",
    attemptCount: 1,
    outcome: { failure: { code: "RIOT_RATE_LIMITED" } },
  });
});

it("관측한 429가 미저장 상태에서 heartbeat도 실패하면 결과를 잊고 재수집하지 않고 종료한다", async () => {
  vi.useFakeTimers();
  const store = new MemoryMatchCollectionJobs();
  Result.unwrap(await store.admit({ puuid: "player", queueId: 420 }, 2));
  store.outcomeError = new MatchCollectionJobPersistenceError({
    retryable: true,
  });
  const source = emptySource();
  source.findSelection = async () => {
    store.renewError = new MatchCollectionJobPersistenceError({
      retryable: true,
    });
    return Result.fail(
      new MatchCollectionAttemptError({
        failure: {
          code: "RIOT_RATE_LIMITED",
          retryAvailableAt: new Date(50000),
        },
      }),
    );
  };
  const selection = vi.spyOn(source, "findSelection");
  const result = worker(store, source)
    .run(new AbortController().signal)
    .catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(25);
  expect(await result).toBeInstanceOf(MatchCollectionOutcomeSaveError);
  expect(selection).toHaveBeenCalledTimes(1);
  expect(store.jobs.get("job-1")?.snapshot.outcome).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});

it("작업 선점 장애는 대기 간격을 두고 재시도하며 종료 시 대기를 정리한다", async () => {
  vi.useFakeTimers();
  const store = new MemoryMatchCollectionJobs();
  const stop = new AbortController();
  const claim = vi
    .spyOn(store, "claimNext")
    .mockResolvedValue(
      Result.fail(new MatchCollectionJobPersistenceError({ retryable: true })),
    );
  const running = worker(store).run(stop.signal);
  await vi.advanceTimersByTimeAsync(15);
  expect(claim).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(10);
  expect(claim).toHaveBeenCalledTimes(2);
  stop.abort();
  await running;
  expect(vi.getTimerCount()).toBe(0);
});

/** @description 테스트에서는 실제 Application과 도메인을 사용하고 저장·외부 수집 경계만 대체한다. */
function worker(store: MemoryMatchCollectionJobs, source = emptySource()) {
  return new MatchCollectionWorker(
    {
      execution: store,
      completion: store,
      query: store,
      collect: new RunMatchCollection(store, store, store, source),
      finalize: new FinalizeMatchCollection(store),
    },
    settings,
    () => {},
  );
}
/** @description 빈 최신 경기 목록을 반환하는 외부 수집 대역이다. */
function emptySource(): MatchCollectionSource {
  return {
    findSelection: async () => Result.succeed([]),
    collectSelection: async () =>
      Result.succeed({ matches: [], outcome: { status: "SUCCEEDED" } }),
  };
}
