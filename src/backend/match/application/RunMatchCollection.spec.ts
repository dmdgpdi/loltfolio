import { Result } from "@praha/byethrow";
import { expect, it, vi } from "vitest";
import { PlayerMatch } from "@/backend/match/domain/PlayerMatch";
import { createPlayerMatchData } from "@/backend/match/testing/createPlayerMatchData";
import { MemoryMatchCollectionJobs } from "@/backend/match/testing/MemoryMatchCollectionJobs";
import { MatchCollectionAttemptError } from "./errors/MatchCollectionAttemptError";
import { MatchCollectionJobPersistenceError } from "./errors/MatchCollectionJobPersistenceError";
import { MatchCollectionLeaseLostError } from "./errors/MatchCollectionLeaseLostError";
import { MatchCollectionOutcomeSaveError } from "./errors/MatchCollectionOutcomeSaveError";
import type { MatchCollectionSource } from "./MatchCollectionSource";
import { RunMatchCollection } from "./RunMatchCollection";
import type { CollectedMatchBatch } from "./types/CollectedMatchBatch.type";

it("목록을 먼저 고정한 뒤 경기를 저장하고 종료 확정 권한을 반환한다", async () => {
  // Arrange
  const { store, source, assignment, service, match } = await setup();

  // Act
  const result = Result.unwrap(
    await service.execute(assignment, new AbortController().signal),
  );

  // Assert
  expect(store.savedMatches).toEqual([match]);
  expect(store.jobs.get("job-1")?.snapshot).toMatchObject({
    status: "FINALIZING",
    selectedMatchIds: ["KR_1"],
    outcome: { status: "SUCCEEDED" },
  });
  expect(result?.lease.purpose).toBe("FINALIZE");
  expect(result?.lease.executionToken).not.toBe(
    assignment.lease.executionToken,
  );
  expect(source.collectSelection).toHaveBeenCalledWith(
    { puuid: "player", queueId: 420 },
    ["KR_1"],
    expect.any(AbortSignal),
  );
  expect(store.syncs.values().next().value?.lastCompletedMatchIds).toBeNull();
});

it("복구 시에는 기록한 목록을 재사용하고 최신 목록은 다시 조회하지 않는다", async () => {
  // Arrange
  const { store, source, assignment, service } = await setup();
  Result.unwrap(await store.saveSelection(assignment.lease, ["KR_1"]));
  Result.unwrap(
    await store.scheduleRetry(assignment.lease, {
      code: "WORKER_INTERRUPTED",
      retryAvailableAt: null,
    }),
  );
  store.now = new Date(6000);
  const recovered = Result.unwrap(await store.claimNext());
  if (!recovered) throw new Error("복구 작업이 필요합니다.");

  // Act
  const result = await service.execute(recovered, new AbortController().signal);

  // Assert
  expect(Result.isSuccess(result)).toBe(true);
  expect(source.findSelection).not.toHaveBeenCalled();
  expect(store.jobs.get("job-1")?.snapshot.attemptCount).toBe(2);
});

it.each([
  "SUCCEEDED",
  "PARTIALLY_SUCCEEDED",
] as const)("수집 경계의 %s 결론을 그대로 기록한다", async (status) => {
  // Arrange
  const { store, source, assignment, service, match } = await setup();
  source.collectSelection.mockResolvedValue(
    Result.succeed({ matches: [match], outcome: { status } }),
  );

  // Act
  const result = await service.execute(
    assignment,
    new AbortController().signal,
  );

  // Assert
  expect(Result.isSuccess(result)).toBe(true);
  expect(store.jobs.get("job-1")?.snapshot.outcome).toEqual({ status });
});

it("빈 목록은 상세 수집 없이 정상 성공으로 기록한다", async () => {
  // Arrange
  const { store, source, assignment, service } = await setup();
  source.findSelection.mockResolvedValue(Result.succeed([]));

  // Act
  await service.execute(assignment, new AbortController().signal);

  // Assert
  expect(source.collectSelection).not.toHaveBeenCalled();
  expect(store.jobs.get("job-1")?.snapshot).toMatchObject({
    status: "FINALIZING",
    selectedMatchIds: [],
    outcome: { status: "SUCCEEDED" },
  });
});

it("일시적 목록 조회 실패는 같은 작업의 복구를 예약한다", async () => {
  // Arrange
  const { store, source, assignment, service } = await setup();
  source.findSelection.mockResolvedValue(
    Result.fail(
      new MatchCollectionAttemptError({
        failure: { code: "TEMPORARY_FAILURE", retryAvailableAt: null },
        cause: new Error("network"),
      }),
    ),
  );

  // Act
  const result = await service.execute(
    assignment,
    new AbortController().signal,
  );

  // Assert
  expect(result).toEqual(Result.succeed(null));
  expect(store.jobs.get("job-1")?.snapshot).toMatchObject({
    status: "RETRY_WAIT",
    nextAttemptAt: new Date(6000),
    selectedMatchIds: null,
  });
  expect(source.collectSelection).not.toHaveBeenCalled();
});

it("공통 수집 시도 한도를 소진하면 실패 확정 권한을 반환한다", async () => {
  // Arrange
  const { store, source, assignment, service } = await setup(1);
  source.findSelection.mockResolvedValue(
    Result.fail(
      new MatchCollectionAttemptError({
        failure: { code: "TEMPORARY_FAILURE", retryAvailableAt: null },
      }),
    ),
  );

  // Act
  const result = Result.unwrap(
    await service.execute(assignment, new AbortController().signal),
  );

  // Assert
  expect(result?.lease.purpose).toBe("FINALIZE");
  expect(store.jobs.get("job-1")?.snapshot.outcome).toEqual({
    status: "FAILED",
    failure: { code: "ATTEMPTS_EXHAUSTED", retryAvailableAt: null },
  });
});

it.each([
  "RIOT_RATE_LIMITED",
  "AUTHENTICATION_FAILED",
  "CONFIGURATION_ERROR",
  "INVALID_RESPONSE",
] as const)("목록 조회의 %s 실패는 수집 복구를 예약하지 않는다", async (code) => {
  // Arrange
  const { store, source, assignment, service } = await setup();
  const failure = {
    code,
    retryAvailableAt: code === "RIOT_RATE_LIMITED" ? new Date(20000) : null,
  };
  source.findSelection.mockResolvedValue(
    Result.fail(new MatchCollectionAttemptError({ failure })),
  );

  // Act
  await service.execute(assignment, new AbortController().signal);

  // Assert
  expect(store.jobs.get("job-1")?.snapshot).toMatchObject({
    status: "FINALIZING",
    outcome: { status: "FAILED", failure },
    nextAttemptAt: null,
  });
  expect(source.collectSelection).not.toHaveBeenCalled();
});

it("경기 수집 중 429는 캐시 저장 장애보다 먼저 기록한다", async () => {
  // Arrange
  const { store, source, assignment, service, match } = await setup();
  const failure = {
    code: "RIOT_RATE_LIMITED",
    retryAvailableAt: new Date(20000),
  } as const;
  source.collectSelection.mockResolvedValue(
    Result.succeed({
      matches: [match],
      outcome: { status: "FAILED", failure },
    }),
  );
  store.matchesError = new MatchCollectionJobPersistenceError({
    retryable: true,
  });

  // Act
  const result = await service.execute(
    assignment,
    new AbortController().signal,
  );

  // Assert
  expect(Result.isSuccess(result)).toBe(true);
  expect(store.jobs.get("job-1")?.snapshot.outcome).toEqual({
    status: "FAILED",
    failure,
  });
  expect(store.savedMatches).toEqual([]);
});

it("429 이외의 중단 오류에서도 확보한 경기 캐시는 먼저 저장한다", async () => {
  // Arrange
  const { store, source, assignment, service, match } = await setup();
  const failure = { code: "INVALID_RESPONSE", retryAvailableAt: null } as const;
  source.collectSelection.mockResolvedValue(
    Result.succeed({
      matches: [match],
      outcome: { status: "FAILED", failure },
    }),
  );

  // Act
  await service.execute(assignment, new AbortController().signal);

  // Assert
  expect(store.savedMatches).toEqual([match]);
  expect(store.jobs.get("job-1")?.snapshot.outcome).toEqual({
    status: "FAILED",
    failure,
  });
});

it("목록 저장 실패 시 상세 수집을 시작하지 않는다", async () => {
  // Arrange
  const { store, source, assignment, service } = await setup();
  store.selectionError = new MatchCollectionJobPersistenceError({
    retryable: true,
  });

  // Act
  await service.execute(assignment, new AbortController().signal);

  // Assert
  expect(source.collectSelection).not.toHaveBeenCalled();
  expect(store.jobs.get("job-1")?.snapshot.status).toBe("RETRY_WAIT");
});

it("일시적인 경기 저장 실패는 고정한 목록을 유지해 복구한다", async () => {
  // Arrange
  const { store, assignment, service } = await setup();
  store.matchesError = new MatchCollectionJobPersistenceError({
    retryable: true,
  });

  // Act
  const result = await service.execute(
    assignment,
    new AbortController().signal,
  );

  // Assert
  expect(result).toEqual(Result.succeed(null));
  expect(store.jobs.get("job-1")?.snapshot).toMatchObject({
    status: "RETRY_WAIT",
    selectedMatchIds: ["KR_1"],
  });
});

it("결과 기록 실패는 관측한 429와 실행 권한을 오류에 보존한다", async () => {
  // Arrange
  const { store, source, assignment, service } = await setup();
  const failure = {
    code: "RIOT_RATE_LIMITED",
    retryAvailableAt: new Date(20000),
  } as const;
  source.findSelection.mockResolvedValue(
    Result.fail(new MatchCollectionAttemptError({ failure })),
  );
  const cause = new MatchCollectionJobPersistenceError({ retryable: true });
  store.outcomeError = cause;

  // Act
  const result = await service.execute(
    assignment,
    new AbortController().signal,
  );

  // Assert
  expect(result).toEqual(
    Result.fail(expect.any(MatchCollectionOutcomeSaveError)),
  );
  expect(Result.unwrapError(result)).toMatchObject({
    cause,
    outcome: { status: "FAILED", failure },
    lease: { jobId: "job-1", purpose: "COLLECT" },
  });
  expect(store.jobs.get("job-1")?.snapshot.status).toBe("RUNNING");
});

it("결과 기록의 응답만 유실되면 재실행 권한으로 수집하지 않는다", async () => {
  // Arrange
  const { store, source, assignment, service } = await setup();
  store.outcomeCommitError = new MatchCollectionJobPersistenceError({
    retryable: true,
  });
  await service.execute(assignment, new AbortController().signal);
  source.findSelection.mockClear();
  source.collectSelection.mockClear();

  // Act
  const retry = await service.execute(assignment, new AbortController().signal);

  // Assert
  expect(retry).toEqual(Result.fail(expect.any(MatchCollectionLeaseLostError)));
  expect(store.jobs.get("job-1")?.snapshot.status).toBe("FINALIZING");
  expect(source.findSelection).not.toHaveBeenCalled();
  expect(source.collectSelection).not.toHaveBeenCalled();
});

it("권한 갱신 실패는 수집·복구 예약을 시작하지 않는다", async () => {
  // Arrange
  const { store, source, assignment, service } = await setup();
  const error = new MatchCollectionJobPersistenceError({ retryable: true });
  store.renewError = error;

  // Act
  const result = await service.execute(
    assignment,
    new AbortController().signal,
  );

  // Assert
  expect(result).toEqual(Result.fail(error));
  expect(source.findSelection).not.toHaveBeenCalled();
  expect(store.jobs.get("job-1")?.snapshot.status).toBe("RUNNING");
});

it("권한을 잃은 쓰기는 저장 실패로 분류해 다시 예약하지 않는다", async () => {
  // Arrange
  const { store, assignment, service } = await setup();
  store.selectionError = new MatchCollectionLeaseLostError();

  // Act
  const result = await service.execute(
    assignment,
    new AbortController().signal,
  );

  // Assert
  expect(result).toEqual(
    Result.fail(expect.any(MatchCollectionLeaseLostError)),
  );
  expect(store.jobs.get("job-1")?.snapshot.status).toBe("RUNNING");
});

it("이미 취소된 실행은 외부 수집을 시작하지 않는다", async () => {
  // Arrange
  const { source, assignment, service } = await setup();
  const controller = new AbortController();
  controller.abort();

  // Act
  const result = await service.execute(assignment, controller.signal);

  // Assert
  expect(result).toEqual(
    Result.fail(expect.any(MatchCollectionLeaseLostError)),
  );
  expect(source.findSelection).not.toHaveBeenCalled();
});

it("수집 중 취소되면 반환된 경기를 저장하거나 성공을 기록하지 않는다", async () => {
  // Arrange
  const { store, source, assignment, service, match } = await setup();
  const controller = new AbortController();
  source.collectSelection.mockImplementation(async () => {
    controller.abort();
    return Result.succeed({
      matches: [match],
      outcome: { status: "SUCCEEDED" },
    });
  });

  // Act
  const result = await service.execute(assignment, controller.signal);

  // Assert
  expect(result).toEqual(
    Result.fail(expect.any(MatchCollectionLeaseLostError)),
  );
  expect(store.savedMatches).toEqual([]);
  expect(store.jobs.get("job-1")?.snapshot.outcome).toBeNull();
});

it("대상이나 확정 목록 밖의 경기 결과는 저장하지 않는다", async () => {
  // Arrange
  const { store, source, assignment, service } = await setup();
  source.collectSelection.mockResolvedValue(
    Result.succeed({
      matches: [new PlayerMatch(createPlayerMatchData({ puuid: "other" }))],
      outcome: { status: "SUCCEEDED" },
    }),
  );

  // Act
  await service.execute(assignment, new AbortController().signal);

  // Assert
  expect(store.savedMatches).toEqual([]);
  expect(store.jobs.get("job-1")?.snapshot.outcome).toEqual({
    status: "FAILED",
    failure: { code: "INVALID_RESPONSE", retryAvailableAt: null },
  });
});

it("목록 조회 후 권한 갱신이 실패하면 상세 수집을 시작하지 않는다", async () => {
  // Arrange
  const { store, source, assignment, service } = await setup();
  const error = new MatchCollectionLeaseLostError();
  source.findSelection.mockImplementation(async () => {
    store.renewError = error;
    return Result.succeed(["KR_1"]);
  });

  // Act
  const result = await service.execute(
    assignment,
    new AbortController().signal,
  );

  // Assert
  expect(result).toEqual(Result.fail(error));
  expect(source.collectSelection).not.toHaveBeenCalled();
  expect(store.jobs.get("job-1")?.snapshot.selectedMatchIds).toBeNull();
});

it("상세 수집 경계의 일시 장애도 같은 작업의 복구로 처리한다", async () => {
  // Arrange
  const { store, source, assignment, service } = await setup();
  source.collectSelection.mockResolvedValue(
    Result.fail(
      new MatchCollectionAttemptError({
        failure: { code: "TEMPORARY_FAILURE", retryAvailableAt: null },
      }),
    ),
  );

  // Act
  const result = await service.execute(
    assignment,
    new AbortController().signal,
  );

  // Assert
  expect(result).toEqual(Result.succeed(null));
  expect(store.jobs.get("job-1")?.snapshot).toMatchObject({
    status: "RETRY_WAIT",
    selectedMatchIds: ["KR_1"],
  });
});

it("복구 예약 자체가 실패하면 예약 성공을 응답하지 않는다", async () => {
  // Arrange
  const { store, source, assignment, service } = await setup();
  const error = new MatchCollectionJobPersistenceError({ retryable: true });
  store.retryError = error;
  source.findSelection.mockResolvedValue(
    Result.fail(
      new MatchCollectionAttemptError({
        failure: { code: "TEMPORARY_FAILURE", retryAvailableAt: null },
      }),
    ),
  );

  // Act
  const result = await service.execute(
    assignment,
    new AbortController().signal,
  );

  // Assert
  expect(result).toEqual(Result.fail(error));
  expect(store.jobs.get("job-1")?.snapshot.status).toBe("RUNNING");
});

it("재시도 불가 경기 저장 오류는 복구 대신 실패 결과를 기록한다", async () => {
  // Arrange
  const { store, assignment, service } = await setup();
  store.matchesError = new MatchCollectionJobPersistenceError({
    retryable: false,
  });

  // Act
  await service.execute(assignment, new AbortController().signal);

  // Assert
  expect(store.jobs.get("job-1")?.snapshot).toMatchObject({
    status: "FINALIZING",
    outcome: { status: "FAILED", failure: { code: "COLLECTION_FAILED" } },
  });
});

it("영구 수집 실패와 캐시 저장 실패가 겹쳐도 수집은 다시 예약하지 않는다", async () => {
  // Arrange
  const { store, source, assignment, service, match } = await setup();
  const failure = { code: "INVALID_RESPONSE", retryAvailableAt: null } as const;
  source.collectSelection.mockResolvedValue(
    Result.succeed({
      matches: [match],
      outcome: { status: "FAILED", failure },
    }),
  );
  const error = new MatchCollectionJobPersistenceError({ retryable: true });
  store.matchesError = error;

  // Act
  const result = await service.execute(
    assignment,
    new AbortController().signal,
  );

  // Assert
  expect(result).toEqual(Result.fail(error));
  expect(store.jobs.get("job-1")?.snapshot).toMatchObject({
    status: "FINALIZING",
    outcome: { status: "FAILED", failure },
  });
});

it("캐시와 결과 저장이 함께 실패하면 두 원인과 수집 결론을 보존한다", async () => {
  // Arrange
  const { store, source, assignment, service, match } = await setup();
  const outcome = {
    status: "FAILED",
    failure: { code: "INVALID_RESPONSE", retryAvailableAt: null },
  } as const;
  source.collectSelection.mockResolvedValue(
    Result.succeed({ matches: [match], outcome }),
  );
  const cacheError = new MatchCollectionJobPersistenceError({
    retryable: true,
  });
  const outcomeError = new MatchCollectionJobPersistenceError({
    retryable: true,
  });
  store.matchesError = cacheError;
  store.outcomeError = outcomeError;

  // Act
  const result = await service.execute(
    assignment,
    new AbortController().signal,
  );

  // Assert
  expect(Result.unwrapError(result)).toMatchObject({
    outcome,
    cause: { cacheError, outcomeError: { cause: outcomeError } },
  });
});

it("취소 직전에 관측한 429는 종료 결과 기록을 먼저 시도한다", async () => {
  // Arrange
  const { store, source, assignment, service } = await setup();
  const controller = new AbortController();
  const failure = {
    code: "RIOT_RATE_LIMITED",
    retryAvailableAt: new Date(20000),
  } as const;
  source.collectSelection.mockImplementation(async () => {
    controller.abort();
    return Result.succeed({
      matches: [],
      outcome: { status: "FAILED", failure },
    });
  });

  // Act
  await service.execute(assignment, controller.signal);

  // Assert
  expect(store.jobs.get("job-1")?.snapshot.outcome).toEqual({
    status: "FAILED",
    failure,
  });
});

it("만료된 토큰은 실행을 시작하지 않는다", async () => {
  // Arrange
  const { store, source, assignment, service } = await setup();
  store.now = new Date(11000);

  // Act
  const result = await service.execute(
    assignment,
    new AbortController().signal,
  );

  // Assert
  expect(result).toEqual(
    Result.fail(expect.any(MatchCollectionLeaseLostError)),
  );
  expect(source.findSelection).not.toHaveBeenCalled();
});

it.each([
  "purpose",
  "jobId",
] as const)("실행 권한의 %s가 작업과 맞지 않으면 외부 수집을 호출하지 않는다", async (field) => {
  // Arrange
  const { source, assignment, service } = await setup();
  const lease = { ...assignment.lease };
  Reflect.set(lease, field, field === "purpose" ? "FINALIZE" : "other-job");

  // Act
  const result = await service.execute(
    { ...assignment, lease },
    new AbortController().signal,
  );

  // Assert
  expect(result).toEqual(
    Result.fail(expect.any(MatchCollectionLeaseLostError)),
  );
  expect(source.findSelection).not.toHaveBeenCalled();
});

/** @description 시나리오마다 실제 작업을 선점하고 외부 수집 경계만 새 대역으로 준비한다. */
async function setup(maxAttempts = 2) {
  const store = new MemoryMatchCollectionJobs();
  Result.unwrap(
    await store.admit({ puuid: "player", queueId: 420 }, maxAttempts),
  );
  store.now = new Date(1000);
  const assignment = Result.unwrap(await store.claimNext());
  if (!assignment) throw new Error("선점한 작업이 필요합니다.");
  const match = new PlayerMatch(createPlayerMatchData());
  const source = {
    findSelection: vi.fn<MatchCollectionSource["findSelection"]>(async () =>
      Result.succeed(["KR_1"]),
    ),
    collectSelection: vi.fn<MatchCollectionSource["collectSelection"]>(
      async () =>
        Result.succeed({
          matches: [match],
          outcome: { status: "SUCCEEDED" },
        } satisfies CollectedMatchBatch),
    ),
  };
  return {
    store,
    source,
    assignment,
    match,
    service: new RunMatchCollection(store, store, store, source),
  };
}
