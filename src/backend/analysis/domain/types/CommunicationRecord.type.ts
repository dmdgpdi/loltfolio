import type { CommunicationPing } from "./CommunicationPing.type";
import type { PingCount } from "./PingCount.type";

/** @description 분석 대상으로 선정된 한 경기의 의사소통 기록. 외부 경기 클래스가 아닌 분석에 필요한 관측만 받는다. */
export type CommunicationRecord = Readonly<
  Record<CommunicationPing, PingCount>
>;
