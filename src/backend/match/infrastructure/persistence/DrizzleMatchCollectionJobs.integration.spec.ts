import { readdir, readFile } from "node:fs/promises";
import { Result } from "@praha/byethrow";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MatchCollectionAdmissionRejectedError } from "@/backend/match/application/errors/MatchCollectionAdmissionRejectedError";
import { MatchCollectionLeaseLostError } from "@/backend/match/application/errors/MatchCollectionLeaseLostError";
import { PlayerMatch } from "@/backend/match/domain/PlayerMatch";
import { createPlayerMatchData } from "@/backend/match/testing/createPlayerMatchData";
import { DrizzleMatchCollectionJobs } from "./DrizzleMatchCollectionJobs";

const connectionString = process.env.MATCH_DB_TEST_URL;

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: 독립된 시나리오를 읽는 순서대로 등록한다.
describe.skipIf(!connectionString)("PostgreSQL 작업 저장소", () => {
  const { pool, store } = context();
  const target = { puuid: "player", queueId: 420 } as const;

  it("접수 → 선점 → 목록·경기 저장 → 결과 기록 → 완료 후 표본을 공개한다", async () => {
    const admitted = Result.unwrap(await store.admit(target, 2));
    const running = Result.unwrap(await store.claimNext());
    expect(running?.job.jobId).toBe(admitted.jobId);
    if (!running) throw new Error("실행 작업 없음");
    Result.unwrap(await store.saveSelection(running.lease, ["KR_1"]));
    Result.unwrap(
      await store.saveMatches(running.lease, [
        new PlayerMatch(createPlayerMatchData()),
      ]),
    );
    const finalizing = Result.unwrap(
      await store.recordOutcome(running.lease, { status: "SUCCEEDED" }),
    );
    expect(finalizing.lease.executionToken).not.toBe(
      running.lease.executionToken,
    );
    expect(
      (await pool.query("SELECT last_completed_match_ids FROM match_syncs"))
        .rows[0].last_completed_match_ids,
    ).toBeNull();
    Result.unwrap(await store.finish(finalizing.lease));
    Result.unwrap(await store.finish(finalizing.lease));
    expect(
      Result.unwrap(await store.findById(admitted.jobId))?.job.status,
    ).toBe("SUCCEEDED");
    expect(
      (
        await pool.query(
          "SELECT status, active_job_id, last_completed_match_ids FROM match_syncs",
        )
      ).rows,
    ).toEqual([
      {
        status: "SUCCEEDED",
        active_job_id: null,
        last_completed_match_ids: ["KR_1"],
      },
    ]);
    expect(
      (await pool.query("SELECT match_id FROM player_matches")).rows,
    ).toEqual([{ match_id: "KR_1" }]);
  });

  it("동시 접수는 작업 하나만 만들고 동시 워커는 같은 작업을 중복 선점하지 않는다", async () => {
    const admitted = (
      await Promise.all([store.admit(target, 2), store.admit(target, 2)])
    ).map((result) => Result.unwrap(result));
    expect(new Set(admitted.map((result) => result.jobId)).size).toBe(1);
    expect(admitted.filter((result) => result.created)).toHaveLength(1);
    const claimed = (
      await Promise.all([store.claimNext(), store.claimNext()])
    ).map((result) => Result.unwrap(result));
    expect(claimed.filter(Boolean)).toHaveLength(1);
  });

  it("갱신은 토큰을 유지하며 호출자가 바꾼 만료 시각을 권한으로 신뢰하지 않는다", async () => {
    Result.unwrap(await store.admit(target, 2));
    const running = Result.unwrap(await store.claimNext());
    if (!running) throw new Error("실행 작업 없음");
    const renewed = Result.unwrap(
      await store.renew({ ...running.lease, leaseExpiresAt: new Date(0) }),
    );
    expect(renewed.executionToken).toBe(running.lease.executionToken);
    await pool.query(
      "UPDATE match_collection_jobs SET lease_expires_at = clock_timestamp() - interval '1 second'",
    );
    const result = await store.saveSelection(
      { ...renewed, leaseExpiresAt: new Date(8640000000000000) },
      ["KR_1"],
    );
    expect(Result.isFailure(result) && result.error).toBeInstanceOf(
      MatchCollectionLeaseLostError,
    );
  });

  it("만료 수집은 같은 ID와 목록으로 복구를 예약하고 새 토큰으로 재개한다", async () => {
    const admitted = Result.unwrap(await store.admit(target, 2));
    const first = Result.unwrap(await store.claimNext());
    if (!first) throw new Error("실행 작업 없음");
    Result.unwrap(await store.saveSelection(first.lease, ["KR_2", "KR_1"]));
    await pool.query(
      "UPDATE match_collection_jobs SET lease_expires_at = clock_timestamp() - interval '1 second'",
    );
    expect(Result.unwrap(await store.claimNext())).toBeNull();
    expect(
      Result.unwrap(await store.findById(admitted.jobId))?.job.status,
    ).toBe("RETRY_WAIT");
    await pool.query(
      "UPDATE match_collection_jobs SET next_attempt_at = updated_at",
    );
    const second = Result.unwrap(await store.claimNext());
    expect(second?.job).toMatchObject({
      jobId: admitted.jobId,
      attemptCount: 2,
      selectedMatchIds: ["KR_2", "KR_1"],
    });
    expect(second?.lease.executionToken).not.toBe(first.lease.executionToken);
    const late = await store.saveMatches(first.lease, []);
    expect(Result.isFailure(late) && late.error).toBeInstanceOf(
      MatchCollectionLeaseLostError,
    );
  });

  it("기록된 429는 만료 후에도 수집하지 않고 종료만 재선점한다", async () => {
    Result.unwrap(await store.admit(target, 2));
    const running = Result.unwrap(await store.claimNext());
    if (!running) throw new Error("실행 작업 없음");
    const retryAt = new Date(Date.now() + 3600000);
    Result.unwrap(
      await store.recordOutcome(running.lease, {
        status: "FAILED",
        failure: { code: "RIOT_RATE_LIMITED", retryAvailableAt: retryAt },
      }),
    );
    await pool.query(
      "UPDATE match_collection_jobs SET lease_expires_at = clock_timestamp() - interval '1 second'",
    );
    const finalizing = Result.unwrap(await store.claimNext());
    expect(finalizing?.lease.purpose).toBe("FINALIZE");
    expect(finalizing?.job.attemptCount).toBe(1);
    if (!finalizing) throw new Error("종료 작업 없음");
    Result.unwrap(await store.finish(finalizing.lease));
    const rejected = await store.admit(target, 2);
    expect(Result.isFailure(rejected) && rejected.error).toBeInstanceOf(
      MatchCollectionAdmissionRejectedError,
    );
    expect(Result.isFailure(rejected) && rejected.error).toMatchObject({
      code: "RIOT_RETRY_RESTRICTED",
      retryAvailableAt: retryAt,
    });
  });

  it("수집 한도가 소진된 만료 작업은 실패 확정으로 넘기고 점유를 해제한다", async () => {
    Result.unwrap(await store.admit(target, 1));
    Result.unwrap(await store.claimNext());
    await pool.query(
      "UPDATE match_collection_jobs SET lease_expires_at = clock_timestamp() - interval '1 second'",
    );
    const exhausted = Result.unwrap(await store.claimNext());
    expect(exhausted?.job).toMatchObject({
      status: "FINALIZING",
      attemptCount: 1,
      outcome: { status: "FAILED", failure: { code: "ATTEMPTS_EXHAUSTED" } },
      lastFailure: { code: "WORKER_INTERRUPTED" },
    });
    if (!exhausted) throw new Error("종료 작업 없음");
    Result.unwrap(await store.finish(exhausted.lease));
    expect(Result.unwrap(await store.admit(target, 1)).created).toBe(true);
  });

  it("잠긴 첫 대상은 건너뛰고 다른 작업을 선점한다", async () => {
    Result.unwrap(await store.admit(target, 2));
    const other = Result.unwrap(
      await store.admit({ puuid: "other", queueId: 420 }, 2),
    );
    const blocker = await pool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query(
        "SELECT * FROM match_syncs WHERE puuid = 'player' FOR UPDATE",
      );
      expect(Result.unwrap(await store.claimNext())?.job.jobId).toBe(
        other.jobId,
      );
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
    }
  });

  it("복구 예약·종료 확정 중 접수는 기존 ID를 공유하고 이전 목적의 쓰기는 거부한다", async () => {
    const admitted = Result.unwrap(await store.admit(target, 2));
    const running = Result.unwrap(await store.claimNext());
    if (!running) throw new Error("실행 작업 없음");
    expect(
      Result.unwrap(
        await store.scheduleRetry(running.lease, {
          code: "TEMPORARY_FAILURE",
          retryAvailableAt: null,
        }),
      ),
    ).toBeNull();
    expect(Result.unwrap(await store.admit(target, 2))).toEqual({
      jobId: admitted.jobId,
      created: false,
    });
    expect(Result.unwrap(await store.claimNext())).toBeNull();
    await pool.query(
      "UPDATE match_collection_jobs SET next_attempt_at = updated_at",
    );
    const retried = Result.unwrap(await store.claimNext());
    if (!retried) throw new Error("재시도 작업 없음");
    const finalizing = Result.unwrap(
      await store.recordOutcome(retried.lease, {
        status: "FAILED",
        failure: { code: "COLLECTION_FAILED", retryAvailableAt: null },
      }),
    );
    expect(Result.unwrap(await store.admit(target, 2))).toEqual({
      jobId: admitted.jobId,
      created: false,
    });
    const results = await Promise.all([
      store.renew(running.lease),
      store.saveSelection(retried.lease, []),
      store.saveMatches(finalizing.lease, []),
      store.recordOutcome(retried.lease, { status: "SUCCEEDED" }),
      store.finish(retried.lease),
    ]);
    for (const result of results)
      expect(Result.isFailure(result) && result.error).toBeInstanceOf(
        MatchCollectionLeaseLostError,
      );
    Result.unwrap(await store.finish(finalizing.lease));
  });

  it("부분 성공에 20분 제한을 적용하고 제한이 지난 실패 최신화는 기존 표본을 보존한다", async () => {
    const admitted = Result.unwrap(await store.admit(target, 2));
    const running = Result.unwrap(await store.claimNext());
    if (!running) throw new Error("실행 작업 없음");
    Result.unwrap(await store.saveSelection(running.lease, ["KR_1", "KR_2"]));
    const finalizing = Result.unwrap(
      await store.recordOutcome(running.lease, {
        status: "PARTIALLY_SUCCEEDED",
      }),
    );
    Result.unwrap(await store.finish(finalizing.lease));
    const rejected = await store.admit(target, 2);
    expect(Result.isFailure(rejected) && rejected.error).toMatchObject({
      code: "COLLECTION_COOLDOWN",
    });
    const read = Result.unwrap(await store.findById(admitted.jobId));
    expect(read?.retryAvailableAt?.getTime()).toBe(
      (read?.job.finishedAt?.getTime() ?? 0) + 1200000,
    );
    await pool.query(
      "UPDATE match_syncs SET last_succeeded_at = clock_timestamp() - interval '21 minutes'",
    );
    const before = (
      await pool.query(
        "SELECT last_succeeded_at, last_completed_match_ids FROM match_syncs",
      )
    ).rows;
    expect(Result.unwrap(await store.admit(target, 2)).created).toBe(true);
    const next = Result.unwrap(await store.claimNext());
    if (!next) throw new Error("최신화 작업 없음");
    const failed = Result.unwrap(
      await store.recordOutcome(next.lease, {
        status: "FAILED",
        failure: { code: "COLLECTION_FAILED", retryAvailableAt: null },
      }),
    );
    Result.unwrap(await store.finish(failed.lease));
    expect(
      (
        await pool.query(
          "SELECT last_succeeded_at, last_completed_match_ids FROM match_syncs",
        )
      ).rows,
    ).toEqual(before);
  });

  it("선택 범위 밖의 경기 저장은 배치 전체를 거부하며 중복 저장은 기존 기록을 보존한다", async () => {
    Result.unwrap(await store.admit(target, 2));
    const running = Result.unwrap(await store.claimNext());
    if (!running) throw new Error("실행 작업 없음");
    Result.unwrap(await store.saveSelection(running.lease, ["KR_1"]));
    const valid = new PlayerMatch(createPlayerMatchData());
    const invalid = new PlayerMatch(createPlayerMatchData({ puuid: "other" }));
    expect(
      Result.isFailure(
        await store.saveMatches(running.lease, [valid, invalid]),
      ),
    ).toBe(true);
    expect(
      (await pool.query("SELECT * FROM player_matches")).rows,
    ).toHaveLength(0);
    Result.unwrap(await store.saveMatches(running.lease, [valid]));
    Result.unwrap(
      await store.saveMatches(running.lease, [
        new PlayerMatch(
          createPlayerMatchData({ win: { status: "AVAILABLE", value: false } }),
        ),
      ]),
    );
    expect((await pool.query("SELECT win FROM player_matches")).rows).toEqual([
      { win: true },
    ]);
  });

  it("경기 SQL 실행 중 권한이 만료되면 저장된 경기까지 롤백한다", async () => {
    Result.unwrap(await store.admit(target, 2));
    const running = Result.unwrap(await store.claimNext());
    if (!running) throw new Error("실행 작업 없음");
    Result.unwrap(await store.saveSelection(running.lease, ["KR_1"]));
    await pool.query(
      `CREATE FUNCTION slow_match_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.2); RETURN NEW; END $$; CREATE TRIGGER slow_match_insert BEFORE INSERT ON player_matches FOR EACH ROW EXECUTE FUNCTION slow_match_insert()`,
    );
    try {
      await pool.query(
        "UPDATE match_collection_jobs SET lease_expires_at = clock_timestamp() + interval '100 milliseconds'",
      );
      const result = await store.saveMatches(running.lease, [
        new PlayerMatch(createPlayerMatchData()),
      ]);
      expect(Result.isFailure(result) && result.error).toBeInstanceOf(
        MatchCollectionLeaseLostError,
      );
      expect(
        (await pool.query("SELECT * FROM player_matches")).rows,
      ).toHaveLength(0);
    } finally {
      await pool.query(
        "DROP TRIGGER slow_match_insert ON player_matches; DROP FUNCTION slow_match_insert()",
      );
    }
  });

  it("만료 작업 Query는 복구를 실행하지 않고 없는 작업은 null이다", async () => {
    const admitted = Result.unwrap(await store.admit(target, 2));
    Result.unwrap(await store.claimNext());
    await pool.query(
      "UPDATE match_collection_jobs SET lease_expires_at = clock_timestamp() - interval '1 second'",
    );
    const before = (await pool.query("SELECT * FROM match_collection_jobs"))
      .rows;
    expect(
      Result.unwrap(await store.findById(admitted.jobId))?.job.status,
    ).toBe("RUNNING");
    expect(Result.unwrap(await store.findById("missing"))).toBeNull();
    expect(
      (await pool.query("SELECT * FROM match_collection_jobs")).rows,
    ).toEqual(before);
  });

  it.each([
    "40001",
    "P0001",
  ])("접수 SQLSTATE %s를 분류하고 최초 대상 생성까지 롤백한다", async (code) => {
    await pool.query(
      `CREATE FUNCTION reject_admission() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION USING ERRCODE = '${code}', MESSAGE = '접수 저장 장애'; END $$; CREATE TRIGGER reject_admission BEFORE INSERT ON match_collection_jobs FOR EACH ROW EXECUTE FUNCTION reject_admission()`,
    );
    try {
      const result = await store.admit(target, 2);
      expect(Result.isFailure(result) && result.error).toMatchObject({
        retryable: code === "40001",
      });
      expect((await pool.query("SELECT * FROM match_syncs")).rows).toHaveLength(
        0,
      );
      expect(
        (await pool.query("SELECT * FROM match_collection_jobs")).rows,
      ).toHaveLength(0);
    } finally {
      await pool.query(
        "DROP TRIGGER reject_admission ON match_collection_jobs; DROP FUNCTION reject_admission()",
      );
    }
  });

  it("최초 목록 교체를 거부하고 저장된 목록을 그대로 반환한다", async () => {
    const admitted = Result.unwrap(await store.admit(target, 2));
    const running = Result.unwrap(await store.claimNext());
    if (!running) throw new Error("실행 작업 없음");
    Result.unwrap(await store.saveSelection(running.lease, ["KR_2", "KR_1"]));
    const replaced = await store.saveSelection(running.lease, ["KR_3", "KR_2"]);
    expect(Result.isFailure(replaced)).toBe(true);
    expect(
      Result.unwrap(await store.findById(admitted.jobId))?.job.selectedMatchIds,
    ).toEqual(["KR_2", "KR_1"]);
  });

  it("완료 저장이 실패하면 작업 종료와 MatchSync 공개를 함께 롤백한다", async () => {
    Result.unwrap(await store.admit(target, 2));
    const running = Result.unwrap(await store.claimNext());
    if (!running) throw new Error("실행 작업 없음");
    Result.unwrap(await store.saveSelection(running.lease, ["KR_1"]));
    const finalizing = Result.unwrap(
      await store.recordOutcome(running.lease, { status: "SUCCEEDED" }),
    );
    await pool.query(
      `CREATE FUNCTION reject_completion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status = 'SUCCEEDED' THEN RAISE EXCEPTION '완료 저장 장애'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_completion BEFORE UPDATE ON match_syncs FOR EACH ROW EXECUTE FUNCTION reject_completion()`,
    );
    try {
      expect(Result.isFailure(await store.finish(finalizing.lease))).toBe(true);
      expect(
        Result.unwrap(await store.findById(running.job.jobId))?.job.status,
      ).toBe("FINALIZING");
      expect(
        (
          await pool.query(
            "SELECT status, active_job_id, last_completed_match_ids FROM match_syncs",
          )
        ).rows,
      ).toEqual([
        {
          status: "IN_PROGRESS",
          active_job_id: running.job.jobId,
          last_completed_match_ids: null,
        },
      ]);
    } finally {
      await pool.query(
        "DROP TRIGGER reject_completion ON match_syncs; DROP FUNCTION reject_completion()",
      );
    }
    Result.unwrap(await store.finish(finalizing.lease));
  });
});

/** @description 앱 테이블을 건드리지 않고 전체 마이그레이션을 적용할 로컬 임시 스키마를 준비한다. */
function context() {
  const schema = `job_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString });
  const pool = new Pool({
    connectionString,
    options: `-c search_path=${schema}`,
  });
  const store = new DrizzleMatchCollectionJobs(drizzle({ client: pool }), {
    leaseDurationMs: 60000,
    retryDelayMs: 5000,
  });
  let created = false;
  beforeAll(async () => {
    if (
      !["localhost", "127.0.0.1"].includes(
        new URL(connectionString ?? "").hostname,
      )
    )
      throw new Error("로컬 DB만 허용");
    await admin.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    const directory = new URL("../../../db/migrations/", import.meta.url);
    for (const name of (await readdir(directory)).sort()) {
      await pool.query(
        (
          await readFile(new URL(`${name}/migration.sql`, directory), "utf8")
        ).replaceAll("--> statement-breakpoint", ""),
      );
    }
  });
  beforeEach(async () => {
    await pool.query(
      "TRUNCATE match_syncs, match_collection_jobs, player_matches",
    );
  });
  afterAll(async () => {
    await pool.end();
    if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  });
  return { pool, store };
}
