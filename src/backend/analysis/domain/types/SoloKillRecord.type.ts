import type { KillCount } from "./KillCount.type";

/** @description 독고다이 분석에 필요한 한 경기의 솔로킬과 전체 킬. 비중은 두 관측이 확보된 공통 표본만 사용한다. */
export type SoloKillRecord = Readonly<{
  soloKills: KillCount;
  kills: KillCount;
}>;
