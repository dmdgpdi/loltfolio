import type { QueueId } from "@/backend/match/domain/types/QueueId.type";
/** @description 최초 생성과 최신화가 공유하는 경기 수집 대상이다. */
export type MatchCollectionTarget = Readonly<{
  puuid: string;
  queueId: QueueId;
}>;
