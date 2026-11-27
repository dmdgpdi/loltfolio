import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { GET as analysis } from "@/app/api/analysis/route";
import { GET as status } from "@/app/api/match-collection-jobs/[jobId]/route";
import { POST as admit } from "@/app/api/match-collection-jobs/route";
import { RiotMatchAdapter } from "@/backend/match/infrastructure/riot/RiotMatchAdapter";
import { createRiotMatchResponse } from "@/backend/match/testing/createRiotMatchResponse";
import { createRiotTimelineResponse } from "@/backend/match/testing/createRiotTimelineResponse";
import { createMatchCollectionWorker } from "./createMatchCollectionWorker";

const database = vi.hoisted(() => vi.fn());
vi.mock("@/backend/db/client", () => ({ getDatabase: database }));
const connectionString = process.env.MATCH_DB_TEST_URL;
const settings = {
  leaseDurationMs: 10000,
  heartbeatIntervalMs: 1000,
  retryDelayMs: 50,
  idlePollIntervalMs: 20,
  maxAttempts: 2,
};

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: HTTP·워커 연결의 독립 시나리오를 순서대로 등록한다.
describe.skipIf(!connectionString)("로컬 작업 HTTP·워커·분석 연결", () => {
  const { pool, db, schema } = context();

  it("실제 Route의 접수 → 워커 수집·완료 → 상태 조회 → 분석 Query를 연결한다", async () => {
    const calls: string[] = [];
    const riot = new RiotMatchAdapter({
      apiKey: "test",
      region: "ASIA",
      fetch: async (input) => {
        const path = new URL((input as Request).url).pathname;
        calls.push(path);
        return Response.json(
          path.includes("by-puuid")
            ? ["KR_1"]
            : path.endsWith("timeline")
              ? createRiotTimelineResponse()
              : createRiotMatchResponse(),
        );
      },
    });
    const admitted = await admit(
      new Request("http://localhost/api/match-collection-jobs", {
        method: "POST",
        body: JSON.stringify({ puuid: "target", queueId: 420 }),
      }),
    );
    expect(admitted.status).toBe(202);
    const { jobId } = await admitted.json();
    expect(calls).toHaveLength(0);
    const stop = new AbortController();
    const running = createMatchCollectionWorker(db, settings, riot).run(
      stop.signal,
    );
    try {
      const response = await waitForSuccess(jobId);
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.json()).toMatchObject({
        jobId,
        status: "SUCCEEDED",
        failure: null,
      });
      const analyzed = await analysis(
        new Request("http://localhost/api/analysis?puuid=target&queueId=420"),
      );
      expect(analyzed.status).toBe(200);
      expect(await analyzed.json()).toMatchObject({
        selectedMatchIds: ["KR_1"],
        analyzedMatchIds: ["KR_1"],
      });
      expect(calls).toHaveLength(3);
      expect(
        (await pool.query("SELECT status, active_job_id FROM match_syncs"))
          .rows,
      ).toEqual([{ status: "SUCCEEDED", active_job_id: null }]);
    } finally {
      stop.abort();
      await running;
    }
  });

  it.each([
    "SIGTERM",
    "SIGINT",
  ] as const)("독립 Node 실행 프로세스는 %s에서 대기·연결을 정리하고 종료한다", async (signal) => {
    const url = new URL(connectionString ?? "");
    url.searchParams.set("options", `-c search_path=${schema}`);
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/match-collection-worker.ts"],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: url.toString() },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const exited = new Promise<number | null>((resolve, reject) => {
      child.once("exit", resolve);
      child.once("error", reject);
    });
    let output = "";
    const ready = new Promise<void>((resolve) => {
      child.stdout?.on("data", (data) => {
        output += data.toString();
        if (output.includes("match_collection_worker_started")) resolve();
      });
    });
    try {
      await Promise.race([
        ready,
        exited.then(() => {
          throw new Error("워커 준비 전 종료");
        }),
      ]);
      child.kill(signal);
      expect(await exited).toBe(0);
      expect(
        (await pool.query("SELECT * FROM match_collection_jobs")).rows,
      ).toHaveLength(0);
    } finally {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
        await exited;
      }
    }
  });
});

/** @description 상태 Query만 폴링하며 테스트 시간 안에 완료되지 않으면 명확히 실패한다. */
async function waitForSuccess(jobId: string): Promise<Response> {
  for (let index = 0; index < 100; index++) {
    const response = await status(
      new Request(`http://localhost/api/match-collection-jobs/${jobId}`),
      { params: Promise.resolve({ jobId }) },
    );
    const body = await response.clone().json();
    if (body.status === "SUCCEEDED") return response;
    if (body.status === "FAILED" || response.status !== 200)
      throw new Error("수집 흐름 실패");
    await delay(10);
  }
  throw new Error("작업 완료 대기 시간 초과");
}

/** @description 로컬 임시 스키마에만 마이그레이션을 적용하고 실제 Composition에 해당 DB를 주입한다. */
function context() {
  const schema = `flow_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString });
  const pool = new Pool({
    connectionString,
    options: `-c search_path=${schema}`,
  });
  const db = drizzle({ client: pool });
  let created = false;
  beforeAll(async () => {
    if (
      !["localhost", "127.0.0.1"].includes(
        new URL(connectionString ?? "").hostname,
      )
    )
      throw new Error("로컬 DB만 허용");
    database.mockReturnValue(db);
    await admin.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    const directory = new URL("../../db/migrations/", import.meta.url);
    for (const name of (await readdir(directory)).sort())
      await pool.query(
        (
          await readFile(new URL(`${name}/migration.sql`, directory), "utf8")
        ).replaceAll("--> statement-breakpoint", ""),
      );
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
  return { pool, db, schema };
}
