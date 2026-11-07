import type { CommunicationStyle } from "../../domain/CommunicationStyle";
import type { FirstBloodStyle } from "../../domain/FirstBloodStyle";
import type { SoloKillStyle } from "../../domain/SoloKillStyle";
import type { StructureStyle } from "../../domain/StructureStyle";
import type { AllyProtectionStyle } from "../../domain/types/AllyProtectionStyle.type";
import type { ChampionPreference } from "../../domain/types/ChampionPreference.type";
import type { ComebackStyle } from "../../domain/types/ComebackStyle.type";
import type { CrowdControlStyle } from "../../domain/types/CrowdControlStyle.type";
import type { DamageTakenStyle } from "../../domain/types/DamageTakenStyle.type";
import type { EnemyTowerKillStyle } from "../../domain/types/EnemyTowerKillStyle.type";
import type { JungleStyle } from "../../domain/types/JungleStyle.type";
import type { LaningStyle } from "../../domain/types/LaningStyle.type";
import type { OutnumberedKillStyle } from "../../domain/types/OutnumberedKillStyle.type";
import type { OwnTowerKillStyle } from "../../domain/types/OwnTowerKillStyle.type";
import type { PositionDistribution } from "../../domain/types/PositionDistribution.type";
import type { SkillshotDodgeStyle } from "../../domain/types/SkillshotDodgeStyle.type";
import type { SurvivalStyle } from "../../domain/types/SurvivalStyle.type";
import type { WinLossComparison } from "../../domain/types/WinLossComparison.type";
import type { VisionStyle } from "../../domain/VisionStyle";
import type { AnalysisTarget } from "./AnalysisTarget.type";

/** @description 프론트에 전달할 조회 데이터. 값 필드만 명시하며 함수·Date·도메인 생성 절차는 노출하지 않는다. */
export type AnalysisDto = Readonly<{
  target: AnalysisTarget;
  selectedMatchIds: readonly string[];
  analyzedMatchIds: readonly string[];
  communication: Pick<CommunicationStyle, "matchCount" | "pings">;
  vision: Pick<VisionStyle, "matchCount" | "activities">;
  structure: Pick<
    StructureStyle,
    | "matchCount"
    | "activities"
    | "firstTowerKills"
    | "firstTowerAssists"
    | "firstTowerParticipation"
  >;
  soloKill: Pick<SoloKillStyle, "matchCount" | "soloKills" | "share">;
  firstBlood: Pick<
    FirstBloodStyle,
    "matchCount" | "kills" | "assists" | "participation"
  >;
  jungle: JungleStyle;
  laning: LaningStyle;
  comeback: ComebackStyle;
  outnumberedKill: OutnumberedKillStyle;
  enemyTowerKill: EnemyTowerKillStyle;
  ownTowerKill: OwnTowerKillStyle;
  skillshotDodge: SkillshotDodgeStyle;
  damageTaken: DamageTakenStyle;
  survival: SurvivalStyle;
  allyProtection: AllyProtectionStyle;
  crowdControl: CrowdControlStyle;
  championPreference: ChampionPreference;
  winLoss: WinLossComparison;
  position: PositionDistribution;
}>;
