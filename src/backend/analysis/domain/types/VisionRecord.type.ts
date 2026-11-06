import type { VisionCount } from "./VisionCount.type";

/** @description 분석 대상으로 선정된 한 경기의 시야 행동. 구매·설치·제거와 20분 전 제거 관여를 별도로 받는다. */
export type VisionRecord = Readonly<{
  controlWardsBought: VisionCount;
  wardsPlaced: VisionCount;
  wardsRemoved: VisionCount;
  wardTakedownsBefore20Minutes: VisionCount;
}>;
