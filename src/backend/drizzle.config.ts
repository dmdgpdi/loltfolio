import { resolve } from "node:path";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

const projectRoot = resolve(__dirname, "../..");

// 외부에서 주입한 환경변수가 우선이며, 로컬 개발에서는 .env를 읽는다.
const { parsed } = config({
  path: resolve(projectRoot, ".env"),
  quiet: true,
});
const url = process.env.DATABASE_URL || parsed?.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL이 필요합니다.");

export default defineConfig({
  dialect: "postgresql",
  schema: resolve(projectRoot, "src/backend/db/schema.ts"),
  out: resolve(projectRoot, "src/backend/db/migrations"),
  dbCredentials: { url },
});
