import type { StoredMatchCollectionJobFailure } from "./StoredMatchCollectionJobFailure.type";

/** @description JSONB에 저장하는 종료 결과이며 Date 객체를 포함하지 않는다. */
export type StoredMatchCollectionJobOutcome = Readonly<
  | { status: "SUCCEEDED" | "PARTIALLY_SUCCEEDED" }
  | { status: "FAILED"; failure: StoredMatchCollectionJobFailure }
>;
