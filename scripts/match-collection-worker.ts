import { config } from "dotenv";
import { getDatabase } from "@/backend/db/client";
import { createMatchCollectionWorker } from "@/backend/match/composition/createMatchCollectionWorker";
import { config as matchCollectionConfig } from "@/backend/match/config";

config({ path: ".env", quiet: true });

/** @description 웹 요청과 별도의 프로세스에서 작업을 실행하며 종료 신호 시 수집 취소·타이머·DB 연결을 정리한다. */
async function main(): Promise<void> {
  const db = getDatabase();
  const stop = new AbortController();
  const shutdown = () => stop.abort();
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  try {
    const worker = createMatchCollectionWorker(db, matchCollectionConfig);
    console.log(JSON.stringify({ event: "match_collection_worker_started" }));
    await worker.run(stop.signal);
  } finally {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
    await db.$client.end();
  }
}

main().catch((cause: unknown) => {
  console.error(
    cause instanceof Error ? cause.message : "워커를 시작할 수 없습니다.",
  );
  process.exitCode = 1;
});
