import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { MatchCollectionJob } from "@/backend/match/domain/MatchCollectionJob";
import { restoreMatchCollectionJob } from "./restoreMatchCollectionJob";
import { serializeMatchCollectionJob } from "./serializeMatchCollectionJob";

it("429 결과의 JSON 저장·복원 후 수집 없이 종료를 확정한다", () => {
  const job = Result.unwrap(
    MatchCollectionJob.create({
      jobId: "job-1",
      puuid: "player",
      queueId: 420,
      maxAttempts: 2,
      requestedAt: new Date(0),
    }),
  );
  Result.unwrap(job.start(new Date(1000)));
  Result.unwrap(
    job.recordOutcome(
      {
        status: "FAILED",
        failure: {
          code: "RIOT_RATE_LIMITED",
          retryAvailableAt: new Date(5000),
        },
      },
      new Date(2000),
    ),
  );
  const stored = serializeMatchCollectionJob(job);
  expect(stored.lastFailure).toEqual({
    code: "RIOT_RATE_LIMITED",
    retryAvailableAt: "1970-01-01T00:00:05.000Z",
  });
  const restored = Result.unwrap(
    restoreMatchCollectionJob({
      ...stored,
      lastFailure: JSON.parse(JSON.stringify(stored.lastFailure)),
      outcome: JSON.parse(JSON.stringify(stored.outcome)),
    }),
  );
  expect(restored.snapshot).toEqual(job.snapshot);
  Result.unwrap(restored.finish(new Date(3000)));
  expect(restored.snapshot.status).toBe("FAILED");
});

it.each([
  null,
  {},
  { requestedAt: "1970-01-01T00:00:00.000Z" },
])("불완전하거나 SQL 날짜 타입이 잘못된 기록을 거부한다: %j", (input) => {
  expect(Result.isFailure(restoreMatchCollectionJob(input))).toBe(true);
});
