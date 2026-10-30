import type { CombatStats } from "./CombatStats.type";
import type { JungleStats } from "./JungleStats.type";
import type { LaningStats } from "./LaningStats.type";
import type { ObjectiveStats } from "./ObjectiveStats.type";
import type { PingStats } from "./PingStats.type";
import type { SupportStats } from "./SupportStats.type";
import type { SurvivalStats } from "./SurvivalStats.type";
import type { VisionStats } from "./VisionStats.type";

/** @description 한 플레이어의 경기 전체 통계를 관심사별로 묶는다. Riot 제공 원값을 보존하며 challenges의 세부 판정·임계값을 자체 재계산하지 않는다. */
export type PlayerMatchStats = Readonly<{
  ping: PingStats;
  vision: VisionStats;
  combat: CombatStats;
  laning: LaningStats;
  jungle: JungleStats;
  objective: ObjectiveStats;
  survival: SurvivalStats;
  support: SupportStats;
}>;
