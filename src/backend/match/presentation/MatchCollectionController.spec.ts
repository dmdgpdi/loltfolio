import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { MatchCollectionAdmissionRejectedError } from "@/backend/match/application/errors/MatchCollectionAdmissionRejectedError";
import { MatchCollectionJobPersistenceError } from "@/backend/match/application/errors/MatchCollectionJobPersistenceError";
import { ProjectedMatchCollectionJobReader } from "@/backend/match/application/ProjectedMatchCollectionJobReader";
import { RequestMatchCollection } from "@/backend/match/application/RequestMatchCollection";
import { MemoryMatchCollectionJobs } from "@/backend/match/testing/MemoryMatchCollectionJobs";
import { MatchCollectionController } from "./MatchCollectionController";

it("명령을 접수해 202·Location을 반환하고 조회에서는 대기 상태만 보여 준다", async () => {
  const store = new MemoryMatchCollectionJobs();
  const controller = createController(store);
  const admitted = await controller.post(
    request({ puuid: "player", queueId: 420 }),
  );
  expect(admitted.status).toBe(202);
  expect(admitted.headers.get("Location")).toBe(
    "/api/match-collection-jobs/job-1",
  );
  expect(admitted.headers.get("Cache-Control")).toBe("no-store");
  expect(await admitted.json()).toEqual({ jobId: "job-1", created: true });
  const found = await controller.get("job-1");
  expect(found.status).toBe(200);
  expect(await found.json()).toMatchObject({
    jobId: "job-1",
    status: "QUEUED",
    failure: null,
  });
});

it("지원하지 않는 큐의 요청은 작업 없이 400이다", async () => {
  const store = new MemoryMatchCollectionJobs();
  const response = await createController(store).post(
    request({ puuid: "player", queueId: 999 }),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    error: { code: "INVALID_COLLECTION_COMMAND" },
  });
  expect(store.jobs.size).toBe(0);
});

it("JSON 해석 실패와 없는 작업·잘못된 ID를 구분하고 오류도 캐시하지 않는다", async () => {
  const controller = createController(new MemoryMatchCollectionJobs());
  const invalid = await controller.post(
    new Request("http://localhost", { method: "POST", body: "{" }),
  );
  expect(invalid.status).toBe(400);
  const missing = await controller.get("missing");
  expect(missing.status).toBe(404);
  expect((await controller.get(" ")).status).toBe(400);
  for (const response of [invalid, missing])
    expect(response.headers.get("Cache-Control")).toBe("no-store");
});

it.each([
  "COLLECTION_COOLDOWN",
  "RIOT_RETRY_RESTRICTED",
] as const)("%s 접수 거부는 409와 재요청 시각을 반환한다", async (code) => {
  const controller = new MatchCollectionController(
    {
      execute: async () =>
        Result.fail(
          new MatchCollectionAdmissionRejectedError({
            code,
            retryAvailableAt: new Date(5000),
          }),
        ),
    },
    new ProjectedMatchCollectionJobReader(new MemoryMatchCollectionJobs()),
  );
  const response = await controller.post(
    request({ puuid: "player", queueId: 420 }),
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    error: { code, retryAvailableAt: "1970-01-01T00:00:05.000Z" },
  });
});

it("예상 저장 장애는 503이고 내부 원인은 노출하지 않는다", async () => {
  const store = new MemoryMatchCollectionJobs();
  store.admissionError = new MatchCollectionJobPersistenceError({
    retryable: true,
    cause: new Error("secret"),
  });
  store.readError = store.admissionError;
  const controller = createController(store);
  for (const response of [
    await controller.post(request({ puuid: "player", queueId: 420 })),
    await controller.get("job-1"),
  ]) {
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  }
});

it("예상하지 못한 예외는 내부 상세 없는 500이다", async () => {
  const controller = new MatchCollectionController(
    {
      execute: async () => {
        throw new Error("secret");
      },
    },
    {
      findById: async () => {
        throw new Error("secret");
      },
    },
  );
  for (const response of [
    await controller.post(request({ puuid: "player", queueId: 420 })),
    await controller.get("job-1"),
  ]) {
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret");
  }
});

it("실패한 작업도 HTTP 200과 실패 상태로 조회된다", async () => {
  const store = new MemoryMatchCollectionJobs();
  Result.unwrap(await store.admit({ puuid: "player", queueId: 420 }, 2));
  const running = Result.unwrap(await store.claimNext());
  if (!running) throw new Error("실행 작업 없음");
  const finalizing = Result.unwrap(
    await store.recordOutcome(running.lease, {
      status: "FAILED",
      failure: { code: "RIOT_RATE_LIMITED", retryAvailableAt: new Date(5000) },
    }),
  );
  const controller = createController(store);
  Result.unwrap(await store.finish(finalizing.lease));
  const response = await controller.get("job-1");
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({
    status: "FAILED",
    failure: { code: "RIOT_RATE_LIMITED" },
  });
  expect(body).not.toHaveProperty("executionToken");
});

/** @description HTTP 검증에서도 실제 Application과 도메인 동작을 사용한다. */
function createController(store: MemoryMatchCollectionJobs) {
  return new MatchCollectionController(
    new RequestMatchCollection(store, 2),
    new ProjectedMatchCollectionJobReader(store),
  );
}
/** @description JSON 입력을 HTTP 요청으로 만든다. */
function request(input: unknown) {
  return new Request("http://localhost/api/match-collection-jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
