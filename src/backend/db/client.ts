import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// 개발 중 모듈이 다시 로드되어도 연결 풀을 재사용한다. 서버 코드에서만 사용한다.
const databaseGlobal = globalThis as typeof globalThis & {
  databasePool?: Pool;
};

export function getDatabase() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL이 필요합니다.");
  databaseGlobal.databasePool ??= new Pool({ connectionString });
  return drizzle({ client: databaseGlobal.databasePool });
}
