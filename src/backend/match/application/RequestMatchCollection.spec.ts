import { Result } from "@praha/byethrow";
import { expect, it, vi } from "vitest";
import { MemoryMatchCollectionJobs } from "@/backend/match/testing/MemoryMatchCollectionJobs";
import { InvalidMatchCollectionCommandError } from "./errors/InvalidMatchCollectionCommandError";
import { MatchCollectionAdmissionRejectedError } from "./errors/MatchCollectionAdmissionRejectedError";
import { MatchCollectionJobPersistenceError } from "./errors/MatchCollectionJobPersistenceError";
import { RequestMatchCollection } from "./RequestMatchCollection";

it("대상의 작업을 접수하고 수집 전에 작업 ID를 반환한다", async () => {
  // Arrange
  const store = new MemoryMatchCollectionJobs();
  const command = new RequestMatchCollection(store, 2);

  // Act
  const result = await command.execute({ puuid: "player", queueId: 420 });

  // Assert
  expect(result).toEqual(Result.succeed({ jobId: "job-1", created: true }));
  expect(store.jobs.get("job-1")?.snapshot).toMatchObject({
    status: "QUEUED",
    attemptCount: 0,
    maxAttempts: 2,
    selectedMatchIds: null,
  });
});

it("같은 대상의 접수는 기존 활성 작업을 공유한다", async () => {
  // Arrange
  const store = new MemoryMatchCollectionJobs();
  const command = new RequestMatchCollection(store, 2);
  await command.execute({ puuid: "player", queueId: 420 });

  // Act
  const result = await command.execute({ puuid: "player", queueId: 420 });

  // Assert
  expect(result).toEqual(Result.succeed({ jobId: "job-1", created: false }));
  expect(store.jobs.size).toBe(1);
});

it("같은 플레이어의 다른 큐는 별도 작업으로 접수한다", async () => {
  // Arrange
  const store = new MemoryMatchCollectionJobs();
  const command = new RequestMatchCollection(store, 2);
  await command.execute({ puuid: "player", queueId: 420 });

  // Act
  const result = await command.execute({ puuid: "player", queueId: 440 });

  // Assert
  expect(result).toEqual(Result.succeed({ jobId: "job-2", created: true }));
});

it.each([
  "COLLECTION_COOLDOWN",
  "RIOT_RETRY_RESTRICTED",
] as const)("%s 접수 거부를 실행 실패로 바꾸지 않고 전달한다", async (code) => {
  // Arrange
  const error = new MatchCollectionAdmissionRejectedError({
    code,
    retryAvailableAt: new Date(1200000),
  });
  const command = new RequestMatchCollection(
    { admit: async () => Result.fail(error) },
    2,
  );

  // Act
  const result = await command.execute({ puuid: "player", queueId: 420 });

  // Assert
  expect(result).toEqual(Result.fail(error));
});

it("접수 저장 실패를 성공으로 응답하지 않는다", async () => {
  // Arrange
  const store = new MemoryMatchCollectionJobs();
  const error = new MatchCollectionJobPersistenceError({
    retryable: true,
    cause: new Error("DB unavailable"),
  });
  store.admissionError = error;

  // Act
  const result = await new RequestMatchCollection(store, 2).execute({
    puuid: "player",
    queueId: 420,
  });

  // Assert
  expect(result).toEqual(Result.fail(error));
  expect(store.jobs.size).toBe(0);
});

it.each([
  "",
  " ",
  " player",
  "player ",
])("유효하지 않은 PUUID %j는 접수 포트를 호출하지 않는다", async (puuid) => {
  // Arrange
  const admit = vi.fn();

  // Act
  const result = await new RequestMatchCollection({ admit }, 2).execute({
    puuid,
    queueId: 420,
  });

  // Assert
  expect(result).toEqual(
    Result.fail(expect.any(InvalidMatchCollectionCommandError)),
  );
  expect(admit).not.toHaveBeenCalled();
});

it.each([
  0,
  -1,
  1.5,
  Infinity,
])("잘못된 시도 한도 %s는 작업을 만들지 않는다", async (limit) => {
  // Arrange
  const admit = vi.fn();

  // Act
  const result = await new RequestMatchCollection({ admit }, limit).execute({
    puuid: "player",
    queueId: 420,
  });

  // Assert
  expect(result).toEqual(
    Result.fail(expect.any(InvalidMatchCollectionCommandError)),
  );
  expect(admit).not.toHaveBeenCalled();
});

it.each([
  999,
  "420",
])("지원하지 않는 큐 %s는 접수하지 않는다", async (queueId) => {
  // Arrange
  const admit = vi.fn();
  const target = { puuid: "player", queueId: 420 as const };
  Reflect.set(target, "queueId", queueId);

  // Act
  const result = await new RequestMatchCollection({ admit }, 2).execute(target);

  // Assert
  expect(result).toEqual(
    Result.fail(expect.any(InvalidMatchCollectionCommandError)),
  );
  expect(admit).not.toHaveBeenCalled();
});
