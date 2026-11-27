import { getDatabase } from "@/backend/db/client";
import { ProjectedMatchCollectionJobReader } from "@/backend/match/application/ProjectedMatchCollectionJobReader";
import { RequestMatchCollection } from "@/backend/match/application/RequestMatchCollection";
import { config as matchCollectionConfig } from "@/backend/match/config";
import { DrizzleMatchCollectionJobs } from "@/backend/match/infrastructure/persistence/DrizzleMatchCollectionJobs";
import { MatchCollectionController } from "@/backend/match/presentation/MatchCollectionController";

let controller: MatchCollectionController | undefined;
let services:
  | { command: RequestMatchCollection; store: DrizzleMatchCollectionJobs }
  | undefined;

/** @description 입력 검증 전에는 DB를 요구하지 않으며 유효 요청부터 실제 저장소를 한 번 조립한다. */
export function getMatchCollectionController(): MatchCollectionController {
  controller ??= new MatchCollectionController(
    { execute: (target) => getServices().command.execute(target) },
    new ProjectedMatchCollectionJobReader({
      findById: (jobId) => getServices().store.findById(jobId),
    }),
  );
  return controller;
}

/** @description 웹 프로세스에서는 작업 접수와 순수 조회만 조립하고 Riot 수집 실행은 생성하지 않는다. */
function getServices() {
  if (!services) {
    const store = new DrizzleMatchCollectionJobs(
      getDatabase(),
      matchCollectionConfig,
    );
    services = {
      command: new RequestMatchCollection(
        store,
        matchCollectionConfig.maxAttempts,
      ),
      store,
    };
  }
  return services;
}
