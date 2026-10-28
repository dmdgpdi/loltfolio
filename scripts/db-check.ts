import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { getDatabase } from "../src/backend/db/client";

config({ path: ".env", quiet: true });

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (url.hostname !== "localhost")
    throw new Error("로컬 DB만 검사할 수 있습니다.");
  const db = getDatabase();
  try {
    const result = await db.execute<{ connected: number }>(
      sql`select 1 as connected`,
    );
    console.log("Drizzle 연결 확인:", result.rows);
  } finally {
    await db.$client.end();
  }
}

main().catch(() => {
  console.error("로컬 DB 연결 실패. DB 실행 상태와 .env을 확인하세요.");
  process.exitCode = 1;
});
