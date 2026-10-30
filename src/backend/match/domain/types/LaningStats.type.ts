import type { Stat } from "./Stat.type";

/** @description 라인전 성장과 상대 우위 기록에 대한 선택 통계. 각 값은 AVAILABLE·NOT_PROVIDED·UNKNOWN 상태를 구분한다. */
export type LaningStats = Readonly<{
  /** @description 초반 라인전 골드·경험치 우위 challenges 지표. 골드 격차 금액으로 해석하지 않는다. */
  earlyLaningPhaseGoldExpAdvantage: Stat<number>;
  /** @description 라인전 골드·경험치 우위 challenges 지표. 시점별 골드 차이와 별개다. */
  laningPhaseGoldExpAdvantage: Stat<number>;
  /** @description 동일 역할 상대 대비 최대 CS 우위. 10분·15분 표본의 CS 차이와 별개다. */
  maxCsAdvantageOnLaneOpponent: Stat<number>;
  /** @description 동일 역할 상대 대비 최대 레벨 우위. */
  maxLevelLeadLaneOpponent: Stat<number>;
  /** @description 첫 10분 동안 처치한 라인 미니언 수. */
  laneMinionsFirst10Minutes: Stat<number>;
  /** @description 분당 골드 획득량. Riot 제공 소수 값을 그대로 보존한다. */
  goldPerMinute: Stat<number>;
  /** @description 라이너의 초반 다른 라인·정글 처치 관련 challenges 지표. 범위 판정은 Riot 기준이다. */
  killsOnOtherLanesEarlyJungleAsLaner: Stat<number>;
}>;
