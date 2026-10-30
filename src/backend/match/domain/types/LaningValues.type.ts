import type { Stat } from "./Stat.type";
/** @description Timeline 한 시점의 성장 수치. own에서는 누적 수치이고 opponentDifference에서는 같은 항목의 본인−상대 차이다. */
export type LaningValues = Readonly<{
  /** @description 해당 시점까지 획득한 총 골드. 현재 보유 골드가 아니다. */
  gold: Stat<number>;
  /** @description 해당 시점의 누적 경험치. */
  xp: Stat<number>;
  /** @description 해당 시점의 챔피언 레벨. */
  level: Stat<number>;
  /** @description 해당 시점까지 처치한 라인 미니언 수(CS). */
  laneCs: Stat<number>;
  /** @description 해당 시점까지의 정글 미니언 처치 수(CS). */
  jungleCs: Stat<number>;
}>;
