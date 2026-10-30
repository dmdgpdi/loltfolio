import type { Stat } from "./Stat.type";

/** @description 와드와 시야 확보 기록에 대한 선택 통계. 각 값은 AVAILABLE·NOT_PROVIDED·UNKNOWN 상태를 구분한다. */
export type VisionStats = Readonly<{
  /** @description 경기 중 구매한 제어 와드 수. 설치 수와 구분한다. */
  visionWardsBoughtInGame: Stat<number>;
  /** @description 와드 설치 수. */
  wardsPlaced: Stat<number>;
  /** @description 와드 파괴 수. */
  wardsKilled: Stat<number>;
  /** @description Riot가 제공한 시야 점수. */
  visionScore: Stat<number>;
  /** @description 참가자 통계의 제어 와드 설치 수. challenges의 controlWardsPlaced와 별도 보존한다. */
  detectorWardsPlaced: Stat<number>;
  /** @description challenges에서 제공한 제어 와드 설치 지표. */
  controlWardsPlaced: Stat<number>;
  /** @description 강 또는 적 진영에서 제어 와드로 시야를 유지한 challenges 지표. 단위와 산식은 임의로 환산하지 않는다. */
  controlWardTimeCoverageInRiverOrEnemyHalf: Stat<number>;
  /** @description 동일 역할 상대 대비 시야 점수 우위 지표. 단순 점수 차이로 재해석하지 않는다. */
  visionScoreAdvantageLaneOpponent: Stat<number>;
  /** @description 와드 파괴 최다 관련 challenges 지표. 실제 파괴 수인 wardsKilled와 구분한다. */
  highestWardKills: Stat<number>;
  /** @description 20분 이전 와드 제거 관련 challenges 지표. */
  wardTakedownsBefore20M: Stat<number>;
  /** @description 탐지기 한 번으로 와드 두 개를 제거한 횟수. */
  twoWardsOneSweeperCount: Stat<number>;
  /** @description 탐지기 한 번으로 와드 세 개를 제거한 횟수. */
  threeWardsOneSweeperCount: Stat<number>;
}>;
