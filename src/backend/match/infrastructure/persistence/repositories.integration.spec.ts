import { readdir, readFile } from "node:fs/promises";
import { Result } from "@praha/byethrow";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MatchCollectionService } from "@/backend/match/application/MatchCollectionService";
import { MatchSyncStartNotAllowedError } from "@/backend/match/domain/errors/MatchSyncStartNotAllowedError";
import { MatchCollectionJob } from "@/backend/match/domain/MatchCollectionJob";
import { PlayerMatch } from "@/backend/match/domain/PlayerMatch";
import { RiotMatchAdapter } from "@/backend/match/infrastructure/riot/RiotMatchAdapter";
import { createPlayerMatchData } from "@/backend/match/testing/createPlayerMatchData";
import { createRiotMatchResponse as matchResponse } from "@/backend/match/testing/createRiotMatchResponse";
import { createRiotTimelineResponse as timelineResponse } from "@/backend/match/testing/createRiotTimelineResponse";
import { DrizzleCompletedMatchReader } from "./DrizzleCompletedMatchReader";
import { DrizzleMatchSyncRepository } from "./DrizzleMatchSyncRepository";
import { DrizzlePlayerMatchRepository } from "./DrizzlePlayerMatchRepository";
import { matchCollectionJobs } from "./matchCollectionJobs.schema";
import { restoreMatchCollectionJob } from "./restoreMatchCollectionJob";
import { serializeMatchCollectionJob } from "./serializeMatchCollectionJob";

const connectionString = process.env.MATCH_DB_TEST_URL;

/** @description 수집 상태 테스트의 기준 시각을 분 단위로 만든다. */
const at = (minute: number) => new Date(Date.UTC(2026, 9, 30, 0, minute));

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: 등록 함수로 명세를 숨기지 않고 독립된 저장소 시나리오를 읽는 순서대로 나열한다.
describe.skipIf(!connectionString)("로컬 PostgreSQL 경기 저장소", () => {
  const { pool, syncs, matches, reader } = createRepositoryContext();

  it("SQL 날짜와 JSONB에 저장한 429 종료 확정 기록을 실제 DB에서 복원한다", async () => {
    const job = Result.unwrap(
      MatchCollectionJob.create({
        jobId: "job-1",
        puuid: "player",
        queueId: 420,
        requestedAt: new Date(0),
        maxAttempts: 2,
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
    const db = drizzle({ client: pool });
    await db.insert(matchCollectionJobs).values({
      ...serializeMatchCollectionJob(job),
      executionToken: "finalize-token",
      executionPurpose: "FINALIZE",
      leaseExpiresAt: new Date(4000),
    });
    const [row] = await db.select().from(matchCollectionJobs);
    const restored = Result.unwrap(restoreMatchCollectionJob(row));
    expect(restored.snapshot).toEqual(job.snapshot);
    Result.unwrap(restored.finish(new Date(3000)));
    expect(restored.snapshot).toMatchObject({
      status: "FAILED",
      finishedAt: new Date(3000),
      lastFailure: {
        code: "RIOT_RATE_LIMITED",
        retryAvailableAt: new Date(5000),
      },
    });
  });

  it("같은 대상의 활성 작업 중복은 막고 다른 큐의 작업은 허용한다", async () => {
    await pool.query(`INSERT INTO match_collection_jobs (job_id, puuid, queue_id, status, max_attempts, attempt_count, requested_at, updated_at)
      VALUES ('job-1', 'player', 420, 'QUEUED', 2, 0, to_timestamp(0), to_timestamp(0))`);
    await expect(
      pool.query(`INSERT INTO match_collection_jobs (job_id, puuid, queue_id, status, max_attempts, attempt_count, requested_at, updated_at)
      VALUES ('job-2', 'player', 420, 'QUEUED', 2, 0, to_timestamp(0), to_timestamp(0))`),
    ).rejects.toMatchObject({ code: "23505" });
    await pool.query(`INSERT INTO match_collection_jobs (job_id, puuid, queue_id, status, max_attempts, attempt_count, requested_at, updated_at)
      VALUES ('job-3', 'player', 440, 'QUEUED', 2, 0, to_timestamp(0), to_timestamp(0))`);
    expect(
      (
        await pool.query(
          "SELECT job_id FROM match_collection_jobs ORDER BY job_id",
        )
      ).rows,
    ).toEqual([{ job_id: "job-1" }, { job_id: "job-3" }]);
  });

  it("실행 권한 없는 실행 상태와 다른 대상의 활성 작업 연결을 거부한다", async () => {
    await expect(
      pool.query(`INSERT INTO match_collection_jobs (job_id, puuid, queue_id, status, max_attempts, attempt_count, requested_at, updated_at, started_at)
      VALUES ('job-1', 'player', 420, 'RUNNING', 2, 1, to_timestamp(0), to_timestamp(1), to_timestamp(1))`),
    ).rejects.toMatchObject({ code: "23514" });
    await pool.query(`INSERT INTO match_collection_jobs (job_id, puuid, queue_id, status, max_attempts, attempt_count, requested_at, updated_at)
      VALUES ('job-1', 'player', 420, 'QUEUED', 2, 0, to_timestamp(0), to_timestamp(0))`);
    await expect(
      pool.query(
        `INSERT INTO match_syncs (puuid, queue_id, status, active_job_id) VALUES ('other-player', 420, 'IN_PROGRESS', 'job-1')`,
      ),
    ).rejects.toMatchObject({ code: "23503" });
    await pool.query(
      `INSERT INTO match_syncs (puuid, queue_id, status, active_job_id) VALUES ('player', 420, 'IN_PROGRESS', 'job-1')`,
    );
  });

  it("확보·미제공·판별 불가 상태를 SQL과 JSONB에 저장하고 복원한다", async () => {
    // Arrange
    const data = createPlayerMatchData({
      gameId: { status: "NOT_PROVIDED" },
      gameMode: { status: "UNKNOWN" },
      gameEndedInSurrender: { status: "UNKNOWN" },
    });
    const match = new PlayerMatch(data);
    Result.unwrap(await matches.saveAll([match]));

    // Act
    const restored = Result.unwrap(
      await matches.findByMatchIds("player", 420, ["KR_1"]),
    )[0];

    // Assert
    expect(restored).toEqual(match);
    const row = (
      await pool.query("SELECT game_id, field_states FROM player_matches")
    ).rows[0];

    // Assert
    expect(row.game_id).toBeNull();
    expect(row.field_states.gameId).toBe("NOT_PROVIDED");
    expect(row.field_states.gameMode).toBe("UNKNOWN");
  });

  it("중복 저장은 기존 기록을 덮어쓰지 않고 플레이어별로 구분한다", async () => {
    // Arrange
    Result.unwrap(
      await matches.saveAll([new PlayerMatch(createPlayerMatchData())]),
    );
    Result.unwrap(
      await matches.saveAll([
        new PlayerMatch(
          createPlayerMatchData({ win: { status: "AVAILABLE", value: false } }),
        ),
        new PlayerMatch(createPlayerMatchData({ puuid: "second" })),
      ]),
    );

    // Act
    const result = Result.unwrap(
      await matches.findByMatchIds("player", 420, ["KR_1"]),
    )[0].win;

    // Assert
    expect(result).toEqual({ status: "AVAILABLE", value: true });

    // Act
    const result2 = Result.unwrap(
      await matches.findByMatchIds("second", 420, ["KR_1"]),
    );

    // Assert
    expect(result2).toHaveLength(1);

    // Act
    const result3 = Result.unwrap(
      await matches.findByMatchIds("player", 440, ["KR_1"]),
    );

    // Assert
    expect(result3).toHaveLength(0);
  });

  it("원본 응답부터 서비스와 DB까지 상태를 보존한다", async () => {
    // Arrange
    const adapter = new RiotMatchAdapter({
      apiKey: "test-key",
      region: "ASIA",
      fetch: async (input) => {
        const path = new URL((input as Request).url).pathname;
        return Response.json(
          path.includes("by-puuid")
            ? ["KR_1"]
            : path.endsWith("timeline")
              ? timelineResponse()
              : matchResponse(),
        );
      },
    });
    const service = new MatchCollectionService(syncs, matches, adapter, () =>
      at(0),
    );
    const collected = Result.unwrap(
      await service.collectRecentMatches("target", 420),
    );

    // Act
    const result = Result.unwrap(
      await matches.findByMatchIds("target", 420, ["KR_1"]),
    );

    // Assert
    expect(result).toEqual(collected);

    // Act
    const collectionResult = await service.collectRecentMatches("target", 420);

    // Assert
    expect(collectionResult).toEqual(
      Result.fail(expect.any(MatchSyncStartNotAllowedError)),
    );
  });

  it("부분 성공 목록의 범위와 순서를 보존하고 분석 가능한 저장 경기만 읽는다", async () => {
    // Arrange
    const ids = ["KR_2", "failed", "excluded", "KR_1"];
    const data = (matchId: string) =>
      new PlayerMatch(createPlayerMatchData({ matchId }));
    Result.unwrap(
      await matches.saveAll([
        data("KR_1"),
        data("old"),
        data("KR_2"),
        new PlayerMatch(
          createPlayerMatchData({
            matchId: "excluded",
            gameEndedInEarlySurrender: { status: "AVAILABLE", value: true },
          }),
        ),
      ]),
    );
    const sync = Result.unwrap(await syncs.tryStart("player", 420, at(0)));
    Result.unwrap(sync.partiallySucceed(at(1), ids));
    Result.unwrap(await syncs.update(sync));

    // Act
    const result = Result.unwrap(await reader.findLatest("player", 420));

    // Assert
    expect(result?.selectedMatchIds).toEqual(ids);
    expect(result?.matches.map(({ matchId }) => matchId)).toEqual([
      "KR_2",
      "KR_1",
    ]);
    expect(Object.isFrozen(result?.selectedMatchIds)).toBe(true);
  });

  it("완료 조회를 플레이어와 큐로 분리한다", async () => {
    // Arrange
    Result.unwrap(
      await matches.saveAll([
        new PlayerMatch(
          createPlayerMatchData({ puuid: "other", matchId: "same" }),
        ),
        new PlayerMatch(
          createPlayerMatchData({ queueId: 440, matchId: "flex" }),
        ),
      ]),
    );
    const sync = Result.unwrap(await syncs.tryStart("player", 420, at(0)));
    Result.unwrap(sync.succeed(at(1), ["same", "flex"]));
    Result.unwrap(await syncs.update(sync));

    // Act
    const result = Result.unwrap(await reader.findLatest("player", 420));

    // Assert
    expect(result).toEqual({ selectedMatchIds: ["same", "flex"], matches: [] });
  });

  it("부분 성공을 DB에 저장하고 성공 시각 기준 20분 제한을 유지한다", async () => {
    // Arrange
    const sync = Result.unwrap(await syncs.tryStart("partial", 420, at(0)));
    Result.unwrap(sync.partiallySucceed(at(1), []));

    // Act
    Result.unwrap(await syncs.update(sync));
    const stored = await pool.query(
      "SELECT status FROM match_syncs WHERE puuid = $1",
      ["partial"],
    );

    // Assert
    expect(stored.rows[0].status).toBe("PARTIALLY_SUCCEEDED");

    // Act
    const result = await syncs.tryStart("partial", 420, at(20));

    // Assert
    expect(result).toEqual(
      Result.fail(expect.any(MatchSyncStartNotAllowedError)),
    );

    // Act
    const next = Result.unwrap(await syncs.tryStart("partial", 420, at(21)));

    // Assert
    expect(next.lastSucceededAt).toEqual(at(1));
  });

  it("기존 원시 NULL과 미등록 분류는 명시적인 상태로 복원한다", async () => {
    // Arrange
    Result.unwrap(
      await matches.saveAll([new PlayerMatch(createPlayerMatchData())]),
    );
    await pool.query(
      "UPDATE player_matches SET game_id = NULL, position = 'ROAMER', game_mode = 'FUTURE_MODE'",
    );

    // Act
    const restored = Result.unwrap(
      await matches.findByMatchIds("player", 420, ["KR_1"]),
    )[0];

    // Assert
    expect(restored.gameId).toEqual({ status: "NOT_PROVIDED" });
    expect(restored.position).toEqual({ status: "UNKNOWN" });
    expect(restored.gameMode).toEqual({ status: "UNKNOWN" });
  });

  it("완료 목록 미보유와 정상 빈 완료를 구분한다", async () => {
    // Arrange
    await pool.query(
      "INSERT INTO match_syncs (puuid, queue_id, status, last_succeeded_at) VALUES ('legacy', 420, 'SUCCEEDED', now())",
    );
    const sync = Result.unwrap(await syncs.tryStart("empty", 420, at(0)));
    Result.unwrap(sync.succeed(at(1), []));
    Result.unwrap(await syncs.update(sync));

    // Act
    const absent = await reader.findLatest("missing", 420);
    const legacy = await reader.findLatest("legacy", 420);
    const empty = await reader.findLatest("empty", 420);

    // Assert
    expect(absent).toEqual(Result.succeed(null));
    expect(legacy).toEqual(Result.succeed(null));
    expect(empty).toEqual(
      Result.succeed({ selectedMatchIds: [], matches: [] }),
    );
  });

  it("큐별 제한과 20분 경계를 DB에서 보장한다", async () => {
    // Arrange
    const started = Result.unwrap(await syncs.tryStart("player", 420, at(0)));
    Result.unwrap(started.succeed(at(1), []));
    Result.unwrap(await syncs.update(started));

    // Act
    const result = await syncs.tryStart("player", 420, at(20));

    // Assert
    expect(result).toEqual(
      Result.fail(expect.any(MatchSyncStartNotAllowedError)),
    );

    // Act
    const result2 = Result.isSuccess(
      await syncs.tryStart("player", 440, at(2)),
    );

    // Assert
    expect(result2).toBe(true);

    // Act
    const next = Result.unwrap(await syncs.tryStart("player", 420, at(21)));

    // Assert
    expect(next.lastSucceededAt).toEqual(at(1));
  });

  it("같은 플레이어·큐의 동시 요청 중 하나만 시작한다", async () => {
    // Arrange: 테스트 인자와 명시한 입력을 사용한다.

    // Act
    const results = await Promise.all(
      Array.from({ length: 12 }, () => syncs.tryStart("player", 420, at(0))),
    );

    // Assert
    expect(results.filter(Result.isSuccess)).toHaveLength(1);
    expect(results.filter(Result.isFailure)).toHaveLength(11);
    expect(
      Result.unwrapError(
        results.find(Result.isFailure) ?? Result.fail(new Error()),
      ),
    ).toBeInstanceOf(MatchSyncStartNotAllowedError);
  });

  it("실패 시 성공 시각을 보존하고 재시도 제한을 적용한다", async () => {
    // Arrange
    const first = Result.unwrap(await syncs.tryStart("player", 420, at(0)));
    Result.unwrap(first.succeed(at(0), []));
    Result.unwrap(await syncs.update(first));
    const retry = Result.unwrap(await syncs.tryStart("player", 420, at(20)));
    Result.unwrap(retry.fail(at(30)));
    Result.unwrap(await syncs.update(retry));

    // Act
    const result = await syncs.tryStart("player", 420, at(29));

    // Assert
    expect(result).toEqual(
      Result.fail(expect.any(MatchSyncStartNotAllowedError)),
    );

    // Act
    const next = Result.unwrap(await syncs.tryStart("player", 420, at(30)));

    // Assert
    expect(next.lastSucceededAt).toEqual(at(0));
  });

  it("진행 중과 실패 상태에서도 이전 완료 표본만 읽는다", async () => {
    // Arrange
    Result.unwrap(
      await matches.saveAll([
        new PlayerMatch(createPlayerMatchData({ matchId: "old" })),
        new PlayerMatch(createPlayerMatchData({ matchId: "new" })),
      ]),
    );
    const first = Result.unwrap(await syncs.tryStart("player", 420, at(0)));
    Result.unwrap(first.succeed(at(1), ["old"]));
    Result.unwrap(await syncs.update(first));
    const next = Result.unwrap(await syncs.tryStart("player", 420, at(21)));

    // Act
    const during = Result.unwrap(await reader.findLatest("player", 420));
    Result.unwrap(next.fail());
    Result.unwrap(await syncs.update(next));
    const failed = Result.unwrap(await reader.findLatest("player", 420));

    // Assert
    expect(during?.matches.map(({ matchId }) => matchId)).toEqual(["old"]);
    expect(failed?.selectedMatchIds).toEqual(["old"]);
  });

  it("이전 시도의 완료 요청은 새 진행 상태를 덮어쓰지 않는다", async () => {
    // Arrange
    const first = Result.unwrap(await syncs.tryStart("player", 420, at(0)));
    Result.unwrap(first.fail());
    Result.unwrap(await syncs.update(first));
    Result.unwrap(await syncs.tryStart("player", 420, at(1)));

    // Act
    const isRejected = Result.isFailure(await syncs.update(first));

    // Assert
    expect(isRejected).toBe(true);
    const stored = await pool.query("SELECT status FROM match_syncs");

    // Assert
    expect(stored.rows[0].status).toBe("IN_PROGRESS");
  });

  it("저장된 완료 목록 오류를 조회 실패로 반환한다", async () => {
    // Arrange
    await pool.query(
      "INSERT INTO match_syncs (puuid, queue_id, status, last_succeeded_at, last_completed_match_ids) VALUES ('broken', 420, 'SUCCEEDED', now(), '[1]'::jsonb)",
    );

    // Act
    const result = await reader.findLatest("broken", 420);

    // Assert
    expect(Result.isFailure(result)).toBe(true);
  });
});

/** @description 테스트 그룹마다 로컬 임시 스키마와 저장소를 준비하고 기존 생명주기 훅을 등록한다. */
function createRepositoryContext() {
  const schema = `match_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString });
  const pool = new Pool({
    connectionString,
    options: `-c search_path=${schema}`,
  });
  const db = drizzle({ client: pool });
  const syncs = new DrizzleMatchSyncRepository(db);
  const matches = new DrizzlePlayerMatchRepository(db);

  let schemaCreated = false;

  beforeAll(async () => {
    const url = new URL(connectionString ?? "");

    if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
      throw new Error("로컬 DB만 테스트할 수 있습니다.");
    }

    await admin.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    const directory = new URL("../../../db/migrations/", import.meta.url);

    for (const name of (await readdir(directory)).sort()) {
      const sql = await readFile(
        new URL(`${name}/migration.sql`, directory),
        "utf8",
      );
      await pool.query(sql.replaceAll("--> statement-breakpoint", ""));
    }
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE match_syncs, player_matches, match_collection_jobs",
    );
  });
  afterAll(async () => {
    await pool.end();

    if (schemaCreated) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }

    await admin.end();
  });

  return { pool, syncs, matches, reader: new DrizzleCompletedMatchReader(db) };
}
