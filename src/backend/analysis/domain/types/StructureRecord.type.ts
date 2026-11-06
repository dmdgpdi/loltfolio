import type { StructureObservation } from "./StructureObservation.type";

/** @description 분석 대상으로 선정된 한 경기의 구조물 관여 기록. 직접 파괴와 어시스트를 분리해 관여를 판정한다. */
export type StructureRecord = Readonly<{
  towerTakedowns: StructureObservation<number>;
  towerPlates: StructureObservation<number>;
  inhibitorTakedowns: StructureObservation<number>;
  firstTowerKill: StructureObservation<boolean>;
  firstTowerAssist: StructureObservation<boolean>;
}>;
