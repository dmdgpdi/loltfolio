import type { Stat } from "./Stat.type";

/** @description 챔피언 전투와 처치 관여 기록에 대한 선택 통계. 각 값은 AVAILABLE·NOT_PROVIDED·UNKNOWN 상태를 구분한다. */
export type CombatStats = Readonly<{
  /** @description 적 챔피언 처치 수. */
  kills: Stat<number>;
  /** @description 사망 횟수. */
  deaths: Stat<number>;
  /** @description 적 챔피언 처치 도움 수. */
  assists: Stat<number>;
  /** @description 적 챔피언에게 가한 총 피해량. */
  totalDamageDealtToChampions: Stat<number>;
  /** @description Riot가 제공한 킬·어시스트 대비 사망 지표. 사망 0 처리 등을 자체 계산하지 않는다. */
  kda: Stat<number>;
  /** @description Riot가 제공한 팀 처치 관여 비율. 저장 시 백분율로 변환하지 않는다. */
  killParticipation: Stat<number>;
  /** @description 단독 처치 수. */
  soloKills: Stat<number>;
  /** @description 빠른 단독 처치 관련 challenges 지표. 빠름의 판정은 Riot 기준을 따른다. */
  quickSoloKills: Stat<number>;
  /** @description 수적 열세 상황의 처치 관련 지표. */
  outnumberedKills: Stat<number>;
  /** @description 적 포탑 근처에서 기록한 처치 수. */
  killsNearEnemyTurret: Stat<number>;
  /** @description 아군 포탑 아래에서 기록한 처치 수. */
  killsUnderOwnTurret: Stat<number>;
  /** @description 아군과 함께 적을 끊어낸 처치 관련 지표. */
  pickKillWithAlly: Stat<number>;
  /** @description 15분 이전 에이스 관련 지표. */
  acesBefore15Minutes: Stat<number>;
  /** @description 아군 사망 없이 적 팀을 전멸시킨 에이스 관련 지표. */
  flawlessAces: Stat<number>;
  /** @description 전설 달성 속도 관련 challenges 원값. 미달성 표현과 단위는 임의로 변환하지 않는다. */
  fastestLegendary: Stat<number>;
  /** @description 챔피언 피해량 최다 관련 지표. 총 피해량 자체와 구분한다. */
  highestChampionDamage: Stat<number>;
  /** @description 첫 번째 적 챔피언 처치를 직접 기록했는지 여부. */
  firstBloodKill: Stat<boolean>;
  /** @description 첫 번째 적 챔피언 처치에 도움을 기록했는지 여부. */
  firstBloodAssist: Stat<boolean>;
}>;
