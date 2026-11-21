import type { MatchCollectionJobFailure } from "./MatchCollectionJobFailure.type";
import type { MatchCollectionJobOutcome } from "./MatchCollectionJobOutcome.type";
import type { MatchCollectionJobStatus } from "./MatchCollectionJobStatus.type";
import type { QueueId } from "./QueueId.type";

/** @description 작업의 관찰 가능한 도메인 기록이다. 시각과 중첩 데이터는 원본 상태와 분리하며 DB 실행 토큰은 포함하지 않는다. */
export type MatchCollectionJobData = Readonly<{
  jobId: string;
  puuid: string;
  queueId: QueueId;
  maxAttempts: number;
  status: MatchCollectionJobStatus;
  requestedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  selectedMatchIds: readonly string[] | null;
  attemptCount: number;
  nextAttemptAt: Date | null;
  lastFailure: MatchCollectionJobFailure | null;
  outcome: MatchCollectionJobOutcome | null;
}>;
