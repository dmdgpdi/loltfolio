import { readdir, readFile } from "node:fs/promises";
import { Result } from "@praha/byethrow";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MatchCollectionService } from "../../application/MatchCollectionService";
import { MatchSyncStartNotAllowedError } from "../../domain/errors/MatchSyncStartNotAllowedError";
import { PlayerMatch } from "../../domain/PlayerMatch";
import { createPlayerMatchData } from "../../testing/createPlayerMatchData";
import { createRiotMatchResponse as matchResponse } from "../../testing/createRiotMatchResponse";
import { createRiotTimelineResponse as timelineResponse } from "../../testing/createRiotTimelineResponse";
import { RiotMatchAdapter } from "../riot/RiotMatchAdapter";
import { DrizzleCompletedMatchReader } from "./DrizzleCompletedMatchReader";
import { DrizzleMatchSyncRepository } from "./DrizzleMatchSyncRepository";
import { DrizzlePlayerMatchRepository } from "./DrizzlePlayerMatchRepository";

const connectionString = process.env.MATCH_DB_TEST_URL;

/** @description 수집 상태 테스트의 기준 시각을 분 단위로 만든다. */
const at = (minute: number) => new Date(Date.UTC(2026, 9, 30, 0, minute));

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
    await pool.query("TRUNCATE match_syncs, player_matches");
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

/** @description 동일 임시 스키마를 사용하는 저장소 검증의 실행 문맥이다. */
type RepositoryTestContext = ReturnType<typeof createRepositoryContext>;

/** @description 동시 요청 중 단 하나의 시작만 DB가 허용하는지 검증한다. */
function registerConcurrentStartTest(context: RepositoryTestContext) {
  const { syncs } = context;
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
}

/** @description 큐별 대기와 성공 시각 기준 경계의 독립성을 검증한다. */
function registerQueueCooldownTest(context: RepositoryTestContext) {
  const { syncs } = context;
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
}

/** @description 실패 후에도 이전 성공 시각과 API 재시도 제한을 보존하는지 검증한다. */
function registerFailureRetryTest(context: RepositoryTestContext) {
  const { syncs } = context;
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
}

/** @description 과거 작업의 완료 요청이 새 작업 상태를 덮어쓰지 않는지 검증한다. */
function registerStaleCompletionTest(context: RepositoryTestContext) {
  const { pool, syncs } = context;
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
}

/** @description 값의 제공 상태가 SQL·JSONB 왕복 후에도 보존되는지 검증한다. */
function registerStatPersistenceTest(context: RepositoryTestContext) {
  const { pool, matches } = context;
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
}

/** @description 중복 저장이 기존 성공 데이터를 바꾸지 않는지 검증한다. */
function registerDuplicateSaveTest(context: RepositoryTestContext) {
  const { matches } = context;
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
}

/** @description 원본 응답에서 수집과 저장까지 연결한 동작을 검증한다. */
function registerCollectionPersistenceTest(context: RepositoryTestContext) {
  const { syncs, matches } = context;
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
}

/** @description 기존 원시 값과 미등록 분류의 상태 복원을 검증한다. */
function registerLegacyRestoreTest(context: RepositoryTestContext) {
  const { pool, matches } = context;
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
}

/** @description 부분 성공 저장 이후에도 성공 기준 대기가 유지되는지 검증한다. */
function registerPartialSuccessTest(context: RepositoryTestContext) {
  const { pool, syncs } = context;
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
}

describe.skipIf(!connectionString)("로컬 PostgreSQL 경기 저장소", () => {
  const context = createRepositoryContext();
  registerConcurrentStartTest(context);
  registerQueueCooldownTest(context);
  registerFailureRetryTest(context);
  registerStaleCompletionTest(context);
  registerStatPersistenceTest(context);
  registerDuplicateSaveTest(context);
  registerCollectionPersistenceTest(context);
  registerLegacyRestoreTest(context);
  registerPartialSuccessTest(context);
  registerCompletedEmptyTest(context);
  registerCompletedOrderTest(context);
  registerCompletedPreservationTest(context);
  registerCompletedIsolationTest(context);
  registerInvalidCompletedSelectionTest(context);
});

/** @description 완료 목록이 없는 기존 성공 기록을 추정하지 않으며 정상 빈 완료는 별도로 반환한다. */
function registerCompletedEmptyTest({
  pool,
  syncs,
  reader,
}: RepositoryTestContext) {
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
}

/** @description 저장·실패·분석 제외가 섞여도 원래 목록과 순서를 유지하고 오래된 경기로 채우지 않는다. */
function registerCompletedOrderTest({
  matches,
  syncs,
  reader,
}: RepositoryTestContext) {
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
}

/** @description 새 경기 저장 뒤 수집이 실패해도 이전 완료 목록을 유지한다. */
function registerCompletedPreservationTest({
  matches,
  syncs,
  reader,
}: RepositoryTestContext) {
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
}

/** @description 동일 경기 ID가 있어도 플레이어와 큐 범위를 혼합하지 않는다. */
function registerCompletedIsolationTest({
  matches,
  syncs,
  reader,
}: RepositoryTestContext) {
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
}

/** @description 잘못된 JSONB 목록을 조회 부재나 과거 경기 선택으로 숨기지 않는다. */
function registerInvalidCompletedSelectionTest({
  pool,
  reader,
}: RepositoryTestContext) {
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
}
