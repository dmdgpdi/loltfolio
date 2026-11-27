import type { getDatabase } from "@/backend/db/client";
import { FinalizeMatchCollection } from "@/backend/match/application/FinalizeMatchCollection";
import { MatchCollectionFetcher } from "@/backend/match/application/MatchCollectionFetcher";
import type { RiotMatchClient } from "@/backend/match/application/RiotMatchClient";
import { RunMatchCollection } from "@/backend/match/application/RunMatchCollection";
import { StoredMatchCollectionSource } from "@/backend/match/application/StoredMatchCollectionSource";
import { DrizzleMatchCollectionJobs } from "@/backend/match/infrastructure/persistence/DrizzleMatchCollectionJobs";
import { DrizzlePlayerMatchRepository } from "@/backend/match/infrastructure/persistence/DrizzlePlayerMatchRepository";
import { RiotMatchAdapter } from "@/backend/match/infrastructure/riot/RiotMatchAdapter";
import { MatchCollectionWorker } from "@/backend/match/infrastructure/worker/MatchCollectionWorker";
import type { MatchCollectionWorkerSettings } from "@/backend/match/infrastructure/worker/MatchCollectionWorkerSettings.type";

/** @description 같은 DB 저장소로 모든 작업 포트를 연결하고 외부 수집은 읽기 실행부에만 주입한다. */
export function createMatchCollectionWorker(
  db: ReturnType<typeof getDatabase>,
  settings: MatchCollectionWorkerSettings,
  riot: RiotMatchClient = new RiotMatchAdapter(),
): MatchCollectionWorker {
  const store = new DrizzleMatchCollectionJobs(db, settings);
  const source = new StoredMatchCollectionSource(
    new MatchCollectionFetcher(new DrizzlePlayerMatchRepository(db), riot),
  );
  return new MatchCollectionWorker(
    {
      execution: store,
      completion: store,
      query: store,
      collect: new RunMatchCollection(store, store, store, source),
      finalize: new FinalizeMatchCollection(store),
    },
    settings,
    (cause, jobId) => {
      console.error(
        JSON.stringify({
          event: "match_collection_worker_error",
          jobId,
          name: cause instanceof Error ? cause.name : "UnknownError",
        }),
      );
    },
  );
}
