import type { FinalizeMatchCollection } from "@/backend/match/application/FinalizeMatchCollection";
import type { MatchCollectionCompletion } from "@/backend/match/application/MatchCollectionCompletion";
import type { MatchCollectionExecution } from "@/backend/match/application/MatchCollectionExecution";
import type { MatchCollectionJobQuery } from "@/backend/match/application/MatchCollectionJobQuery";
import type { RunMatchCollection } from "@/backend/match/application/RunMatchCollection";

/** @description 워커 실행 루프에 필요한 Application 유스케이스와 영속성 포트다. */
export type MatchCollectionWorkerDependencies = Readonly<{
  execution: MatchCollectionExecution;
  completion: MatchCollectionCompletion;
  query: MatchCollectionJobQuery;
  collect: Pick<RunMatchCollection, "execute">;
  finalize: Pick<FinalizeMatchCollection, "execute">;
}>;
