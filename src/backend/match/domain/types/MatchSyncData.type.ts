import type { MatchSyncStatus } from "./MatchSyncStatus.type";
import type { QueueId } from "./QueueId.type";

/** @description 플레이어·큐 조합의 수집 상태를 저장·복원하기 위한 데이터. 각 시각은 경기 시간이 아닌 수집 작업의 절대 시각이다. */
export type MatchSyncData = Readonly<{
  /** @description Riot 플레이어 고유 식별자. 닉네임이 바뀌어도 같은 플레이어의 기록을 연결한다. */
  puuid: string;
  /** @description 솔로 랭크·자유 랭크 등 매칭 종류. 게임 규칙이나 맵과 별도인 분류다. */
  queueId: QueueId;
  /** @description 경기 수집의 현재 진행 상태. 경기의 승패나 종료 상태와는 별개다. */
  status: MatchSyncStatus;
  /** @description 마지막 수집을 시작한 절대 시각. 시도 기록이 없으면 null이다. */
  lastAttemptAt: Date | null;
  /** @description 마지막 수집 성공 시각. 실패해도 보존하며, 이 시각부터 20분간 새 수집을 제한한다. */
  lastSucceededAt: Date | null;
  /** @description API 제한으로 재시도가 가능해지는 절대 시각. null은 별도 API 대기 제한이 없다는 뜻이다. */
  retryAvailableAt: Date | null;
}>;
