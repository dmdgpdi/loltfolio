import type { CommunicationStyle } from "@/backend/analysis/domain/CommunicationStyle";
import type { FirstBloodStyle } from "@/backend/analysis/domain/FirstBloodStyle";
import type { SoloKillStyle } from "@/backend/analysis/domain/SoloKillStyle";
import type { StructureStyle } from "@/backend/analysis/domain/StructureStyle";
import type { AllyProtectionStyle } from "@/backend/analysis/domain/types/AllyProtectionStyle.type";
import type { ChampionPreference } from "@/backend/analysis/domain/types/ChampionPreference.type";
import type { ComebackStyle } from "@/backend/analysis/domain/types/ComebackStyle.type";
import type { CrowdControlStyle } from "@/backend/analysis/domain/types/CrowdControlStyle.type";
import type { DamageTakenStyle } from "@/backend/analysis/domain/types/DamageTakenStyle.type";
import type { EnemyTowerKillStyle } from "@/backend/analysis/domain/types/EnemyTowerKillStyle.type";
import type { JungleStyle } from "@/backend/analysis/domain/types/JungleStyle.type";
import type { LaningStyle } from "@/backend/analysis/domain/types/LaningStyle.type";
import type { OutnumberedKillStyle } from "@/backend/analysis/domain/types/OutnumberedKillStyle.type";
import type { OwnTowerKillStyle } from "@/backend/analysis/domain/types/OwnTowerKillStyle.type";
import type { PositionDistribution } from "@/backend/analysis/domain/types/PositionDistribution.type";
import type { SkillshotDodgeStyle } from "@/backend/analysis/domain/types/SkillshotDodgeStyle.type";
import type { SurvivalStyle } from "@/backend/analysis/domain/types/SurvivalStyle.type";
import type { WinLossComparison } from "@/backend/analysis/domain/types/WinLossComparison.type";
import type { VisionStyle } from "@/backend/analysis/domain/VisionStyle";
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
