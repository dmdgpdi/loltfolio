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
import { DrizzleMatchSyncRepository } from "./DrizzleMatchSyncRepository";
import { DrizzlePlayerMatchRepository } from "./DrizzlePlayerMatchRepository";

const connectionString = process.env.MATCH_DB_TEST_URL;

describe.skipIf(!connectionString)("로컬 PostgreSQL 경기 저장소", () => {
  const schema = `match_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString });
  const pool = new Pool({
    connectionString,
    options: `-c search_path=${schema}`,
  });
  const db = drizzle({ client: pool });
  const syncs = new DrizzleMatchSyncRepository(db);
  const matches = new DrizzlePlayerMatchRepository(db);
  const at = (minute: number) => new Date(Date.UTC(2026, 9, 30, 0, minute));

  let schemaCreated = false;

  beforeAll(async () => {
    const url = new URL(connectionString ?? "");
    if (!["localhost", "127.0.0.1"].includes(url.hostname))
      throw new Error("로컬 DB만 테스트할 수 있습니다.");
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
    if (schemaCreated)
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  });

  it("같은 플레이어·큐의 동시 요청 중 하나만 시작한다", async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () => syncs.tryStart("player", 420, at(0))),
    );
    expect(results.filter(Result.isSuccess)).toHaveLength(1);
    expect(results.filter(Result.isFailure)).toHaveLength(11);
    expect(
      Result.unwrapError(
        results.find(Result.isFailure) ?? Result.fail(new Error()),
      ),
    ).toBeInstanceOf(MatchSyncStartNotAllowedError);
  });

  it("큐별 제한과 20분 경계를 DB에서 보장한다", async () => {
    const started = Result.unwrap(await syncs.tryStart("player", 420, at(0)));
    Result.unwrap(started.succeed(at(1)));
    Result.unwrap(await syncs.update(started));

    expect(await syncs.tryStart("player", 420, at(20))).toEqual(
      Result.fail(expect.any(MatchSyncStartNotAllowedError)),
    );
    expect(Result.isSuccess(await syncs.tryStart("player", 440, at(2)))).toBe(
      true,
    );
    const next = Result.unwrap(await syncs.tryStart("player", 420, at(21)));
    expect(next.lastSucceededAt).toEqual(at(1));
  });

  it("실패 시 성공 시각을 보존하고 재시도 제한을 적용한다", async () => {
    const first = Result.unwrap(await syncs.tryStart("player", 420, at(0)));
    Result.unwrap(first.succeed(at(0)));
    Result.unwrap(await syncs.update(first));
    const retry = Result.unwrap(await syncs.tryStart("player", 420, at(20)));
    Result.unwrap(retry.fail(at(30)));
    Result.unwrap(await syncs.update(retry));

    expect(await syncs.tryStart("player", 420, at(29))).toEqual(
      Result.fail(expect.any(MatchSyncStartNotAllowedError)),
    );
    const next = Result.unwrap(await syncs.tryStart("player", 420, at(30)));
    expect(next.lastSucceededAt).toEqual(at(0));
  });

  it("이전 시도의 완료 요청은 새 진행 상태를 덮어쓰지 않는다", async () => {
    const first = Result.unwrap(await syncs.tryStart("player", 420, at(0)));
    Result.unwrap(first.fail());
    Result.unwrap(await syncs.update(first));
    Result.unwrap(await syncs.tryStart("player", 420, at(1)));

    expect(Result.isFailure(await syncs.update(first))).toBe(true);
    const stored = await pool.query("SELECT status FROM match_syncs");
    expect(stored.rows[0].status).toBe("IN_PROGRESS");
  });

  it("확보·미제공·판별 불가 상태를 SQL과 JSONB에 저장하고 복원한다", async () => {
    const data = createPlayerMatchData({
      gameId: { status: "NOT_PROVIDED" },
      gameMode: { status: "UNKNOWN" },
      gameEndedInSurrender: { status: "UNKNOWN" },
    });
    const match = new PlayerMatch(data);
    Result.unwrap(await matches.saveAll([match]));
    const restored = Result.unwrap(
      await matches.findByMatchIds("player", 420, ["KR_1"]),
    )[0];
    expect(restored).toEqual(match);
    const row = (
      await pool.query("SELECT game_id, field_states FROM player_matches")
    ).rows[0];
    expect(row.game_id).toBeNull();
    expect(row.field_states.gameId).toBe("NOT_PROVIDED");
    expect(row.field_states.gameMode).toBe("UNKNOWN");
  });
  it("중복 저장은 기존 기록을 덮어쓰지 않고 플레이어별로 구분한다", async () => {
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
    expect(
      Result.unwrap(await matches.findByMatchIds("player", 420, ["KR_1"]))[0]
        .win,
    ).toEqual({ status: "AVAILABLE", value: true });
    expect(
      Result.unwrap(await matches.findByMatchIds("second", 420, ["KR_1"])),
    ).toHaveLength(1);
    expect(
      Result.unwrap(await matches.findByMatchIds("player", 440, ["KR_1"])),
    ).toHaveLength(0);
  });
  it("원본 응답부터 서비스와 DB까지 상태를 보존한다", async () => {
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
    expect(
      Result.unwrap(await matches.findByMatchIds("target", 420, ["KR_1"])),
    ).toEqual(collected);
    expect(await service.collectRecentMatches("target", 420)).toEqual(
      Result.fail(expect.any(MatchSyncStartNotAllowedError)),
    );
  });
  it("기존 원시 NULL과 미등록 분류는 명시적인 상태로 복원한다", async () => {
    Result.unwrap(
      await matches.saveAll([new PlayerMatch(createPlayerMatchData())]),
    );
    await pool.query(
      "UPDATE player_matches SET game_id = NULL, position = 'ROAMER', game_mode = 'FUTURE_MODE'",
    );
    const restored = Result.unwrap(
      await matches.findByMatchIds("player", 420, ["KR_1"]),
    )[0];
    expect(restored.gameId).toEqual({ status: "NOT_PROVIDED" });
    expect(restored.position).toEqual({ status: "UNKNOWN" });
    expect(restored.gameMode).toEqual({ status: "UNKNOWN" });
  });
  it("부분 성공을 DB에 저장하고 성공 시각 기준 20분 제한을 유지한다", async () => {
    const sync = Result.unwrap(await syncs.tryStart("partial", 420, at(0)));
    Result.unwrap(sync.partiallySucceed(at(1)));
    Result.unwrap(await syncs.update(sync));
    const stored = await pool.query(
      "SELECT status FROM match_syncs WHERE puuid = $1",
      ["partial"],
    );
    expect(stored.rows[0].status).toBe("PARTIALLY_SUCCEEDED");
    expect(await syncs.tryStart("partial", 420, at(20))).toEqual(
      Result.fail(expect.any(MatchSyncStartNotAllowedError)),
    );
    const next = Result.unwrap(await syncs.tryStart("partial", 420, at(21)));
    expect(next.lastSucceededAt).toEqual(at(1));
  });
});
