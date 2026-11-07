import type { QueueId } from "../../../match/domain/types/QueueId.type";

/** @description 플레이어와 지원 큐로 분석 조회 범위를 지정한다. 닉네임 해석과 외부 수집은 이 계약에 포함하지 않는다. */
export type AnalysisTarget = Readonly<{
  puuid: string;
  queueId: QueueId;
}>;
