import type { MatchCollectionJobFailure } from "./MatchCollectionJobFailure.type";

/** @description 결과 기록 이후에는 교체할 수 없는 수집의 종료 결과다. 분석 성공 여부는 포함하지 않는다. */
export type MatchCollectionJobOutcome =
  | Readonly<{ status: "SUCCEEDED" | "PARTIALLY_SUCCEEDED" }>
  | Readonly<{ status: "FAILED"; failure: MatchCollectionJobFailure }>;
