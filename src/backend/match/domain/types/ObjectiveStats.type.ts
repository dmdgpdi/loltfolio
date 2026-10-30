import type { Stat } from "./Stat.type";

/** @description 포탑·억제기·에픽 몬스터 관여 기록에 대한 선택 통계. 각 값은 AVAILABLE·NOT_PROVIDED·UNKNOWN 상태를 구분한다. */
export type ObjectiveStats = Readonly<{
  /** @description 포탑 파괴 관여 수. 직접 마지막 타격 여부와 구분한다. */
  turretTakedowns: Stat<number>;
  /** @description 억제기 파괴 관여 수. */
  inhibitorTakedowns: Stat<number>;
  /** @description 포탑에 가한 피해량. */
  damageDealtToTurrets: Stat<number>;
  /** @description 참가자 통계의 오브젝트 탈취 수. epicMonsterSteals와 별도 보존한다. */
  objectivesStolen: Stat<number>;
  /** @description 드래곤 처치 관여 지표. */
  dragonTakedowns: Stat<number>;
  /** @description 내셔 남작 처치 관여 지표. */
  baronTakedowns: Stat<number>;
  /** @description challenges의 에픽 몬스터 탈취 지표. */
  epicMonsterSteals: Stat<number>;
  /** @description 가장 이른 내셔 남작 관련 challenges 시각 원값. 자체 표본 시각과 구분한다. */
  earliestBaron: Stat<number>;
  /** @description 가장 이른 드래곤 처치 관여 시각의 challenges 원값. */
  earliestDragonTakedown: Stat<number>;
  /** @description 첫 포탑 파괴 관련 challenges 지표. firstTowerKill의 불리언과 구분한다. */
  firstTurretKilled: Stat<number>;
  /** @description 첫 포탑 파괴 시각의 challenges 원값. */
  firstTurretKilledTime: Stat<number>;
  /** @description 빠른 첫 포탑 파괴 관련 지표. 빠름의 기준은 Riot 판정을 따른다. */
  quickFirstTurret: Stat<number>;
  /** @description 획득한 포탑 방패 관련 지표. */
  turretPlatesTaken: Stat<number>;
  /** @description 남작 버프 중 골드 우위 임계값 달성 관련 지표. 임계값이나 골드 금액을 자체 추정하지 않는다. */
  baronBuffGoldAdvantageOverThreshold: Stat<number>;
  /** @description 첫 포탑 파괴의 마지막 타격을 기록했는지 여부. */
  firstTowerKill: Stat<boolean>;
  /** @description 첫 포탑 파괴에 도움을 기록했는지 여부. */
  firstTowerAssist: Stat<boolean>;
}>;
