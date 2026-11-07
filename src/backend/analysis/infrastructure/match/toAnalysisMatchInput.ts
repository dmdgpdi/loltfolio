import type { PlayerMatch } from "../../../match/domain/PlayerMatch";
import type { LaningValues } from "../../../match/domain/types/LaningValues.type";
import type { Stat } from "../../../match/domain/types/Stat.type";
import type { AnalysisMatchInput } from "../../application/types/AnalysisMatchInput.type";
import type { AnalysisObservation } from "../../domain/types/AnalysisObservation.type";
import type { LaningGameRule } from "../../domain/types/LaningGameRule.type";
import type { LaningGrowth } from "../../domain/types/LaningGrowth.type";

/** @description 저장 경기의 상태와 단위를 유지해 각 분석 입력으로 변환한다. 새 의미를 추정하거나 원천을 대체하지 않는다. */
export function toAnalysisMatchInput(match: PlayerMatch): AnalysisMatchInput {
  const points = Object.freeze(
    match.laningSnapshots.map((point) =>
      Object.freeze({
        minute: point.minute,
        actualTimestampMs: point.actualTimestampMs,
        own: mapGrowth(point.own),
        opponentDifference: mapGrowth(point.opponentDifference),
      }),
    ),
  );
  const difference = points.find(
    ({ minute }) => minute === 15,
  )?.opponentDifference;
  const gold =
    difference?.status === "AVAILABLE"
      ? difference.value.gold
      : (difference ?? Object.freeze({ status: "NOT_PROVIDED" as const }));
  return Object.freeze({
    matchId: match.matchId,
    ...mapCommunication(match),
    ...mapCombat(match),
    ...mapObjectives(match),
    ...mapSupport(match),
    ...mapSurvivalAndWinLoss(match),
    championPreference: Object.freeze({
      championId: match.championId,
      position: match.position,
    }),
    position: Object.freeze({ position: match.position }),
    comeback: Object.freeze({
      position: match.position,
      goldDifferenceAt15Minutes: gold,
      win: match.win,
    }),
    laning: Object.freeze({
      position: match.position,
      gameRule: gameRule(match),
      points,
      earlyAdvantageIndicator:
        match.stats.laning.earlyLaningPhaseGoldExpAdvantage,
      laningAdvantageIndicator: match.stats.laning.laningPhaseGoldExpAdvantage,
      laneMinionsFirst10Minutes: match.stats.laning.laneMinionsFirst10Minutes,
      maximumLevelLead: match.stats.laning.maxLevelLeadLaneOpponent,
      towerPlates: match.stats.objective.turretPlatesTaken,
    }),
  });
}

/** @description 맵과 규칙까지 확보된 협곡 랭크만 확인하고 미확보 정보를 큐 이름만으로 추정하지 않는다. */
function gameRule(match: PlayerMatch): LaningGameRule {
  if (
    match.mapId.status !== "AVAILABLE" ||
    match.mapId.value !== 11 ||
    match.gameMode.status !== "AVAILABLE" ||
    match.gameMode.value !== "CLASSIC"
  ) {
    return "OTHER";
  }

  return match.queueId === 420
    ? "SOLO_RANKED"
    : match.queueId === 440
      ? "FLEX_RANKED"
      : "OTHER";
}

/** @description 경험치 필드명 xp를 분석 용어 experience로 바꾸며 부모·자식 관측 상태를 그대로 유지한다. */
function mapGrowth(
  observation: Stat<LaningValues>,
): AnalysisObservation<LaningGrowth> {
  if (observation.status !== "AVAILABLE") {
    return observation;
  }

  const value = observation.value;
  return Object.freeze({
    status: "AVAILABLE",
    value: Object.freeze({
      gold: value.gold,
      experience: value.xp,
      level: value.level,
      laneCs: value.laneCs,
      jungleCs: value.jungleCs,
    }),
  });
}

/** @description 관련 원천 필드를 분석 소유 이름으로 옮기며 각 지표를 독립적으로 보존한다. */
function mapCommunication(
  match: PlayerMatch,
): Pick<AnalysisMatchInput, "communication" | "vision"> {
  return {
    communication: Object.freeze({
      enemyMissing: match.stats.ping.enemyMissingPings,
      danger: match.stats.ping.dangerPings,
      retreat: match.stats.ping.retreatPings,
      getBack: match.stats.ping.getBackPings,
      onMyWay: match.stats.ping.onMyWayPings,
      allIn: match.stats.ping.allInPings,
      assistMe: match.stats.ping.assistMePings,
    }),
    vision: Object.freeze({
      controlWardsBought: match.stats.vision.visionWardsBoughtInGame,
      wardsPlaced: match.stats.vision.wardsPlaced,
      wardsRemoved: match.stats.vision.wardsKilled,
      wardTakedownsBefore20Minutes: match.stats.vision.wardTakedownsBefore20M,
    }),
  };
}

/** @description 관련 원천 필드를 분석 소유 이름으로 옮기며 각 지표를 독립적으로 보존한다. */
function mapCombat(
  match: PlayerMatch,
): Pick<
  AnalysisMatchInput,
  | "soloKill"
  | "firstBlood"
  | "outnumberedKill"
  | "enemyTowerKill"
  | "ownTowerKill"
  | "skillshotDodge"
> {
  return {
    soloKill: Object.freeze({
      soloKills: match.stats.combat.soloKills,
      kills: match.stats.combat.kills,
    }),
    firstBlood: Object.freeze({
      kill: match.stats.combat.firstBloodKill,
      assist: match.stats.combat.firstBloodAssist,
    }),
    outnumberedKill: Object.freeze({
      outnumberedKills: match.stats.combat.outnumberedKills,
    }),
    enemyTowerKill: Object.freeze({
      killsNearEnemyTower: match.stats.combat.killsNearEnemyTurret,
      kills: match.stats.combat.kills,
    }),
    ownTowerKill: Object.freeze({
      killsUnderOwnTower: match.stats.combat.killsUnderOwnTurret,
    }),
    skillshotDodge: Object.freeze({
      skillshotsDodged: match.stats.survival.skillshotsDodged,
    }),
  };
}

/** @description 관련 원천 필드를 분석 소유 이름으로 옮기며 각 지표를 독립적으로 보존한다. */
function mapObjectives(
  match: PlayerMatch,
): Pick<AnalysisMatchInput, "structure" | "jungle"> {
  return {
    structure: Object.freeze({
      towerTakedowns: match.stats.objective.turretTakedowns,
      towerPlates: match.stats.objective.turretPlatesTaken,
      inhibitorTakedowns: match.stats.objective.inhibitorTakedowns,
      firstTowerKill: match.stats.objective.firstTowerKill,
      firstTowerAssist: match.stats.objective.firstTowerAssist,
    }),
    jungle: Object.freeze({
      position: match.position,
      enemyJungleMonsterKills: match.stats.jungle.enemyJungleMonsterKills,
      enemyJungleMinionsKilled:
        match.stats.jungle.totalEnemyJungleMinionsKilled,
      scuttleCrabKills: match.stats.jungle.scuttleCrabKills,
      earlyLanerKills: match.stats.jungle.killsOnLanersEarlyJungleAsJungler,
      dragonTakedowns: match.stats.objective.dragonTakedowns,
      baronTakedowns: match.stats.objective.baronTakedowns,
      buffsStolen: match.stats.jungle.buffsStolen,
    }),
  };
}

/** @description 관련 원천 필드를 분석 소유 이름으로 옮기며 각 지표를 독립적으로 보존한다. */
function mapSupport(
  match: PlayerMatch,
): Pick<AnalysisMatchInput, "damageTaken" | "allyProtection" | "crowdControl"> {
  return {
    damageTaken: Object.freeze({
      damageTaken: match.stats.survival.totalDamageTaken,
      damageMitigated: match.stats.survival.damageSelfMitigated,
      teamDamageTakenRatio: match.stats.survival.damageTakenOnTeamPercentage,
    }),
    allyProtection: Object.freeze({
      healingToAllies: match.stats.support.totalHealsOnTeammates,
      damageShieldedOnAllies:
        match.stats.support.totalDamageShieldedOnTeammates,
      allySaves: match.stats.support.saveAllyFromDeath,
    }),
    crowdControl: Object.freeze({
      immobilizations: match.stats.support.enemyChampionImmobilizations,
      crowdControlSeconds: match.stats.support.timeCCingOthers,
      immobilizeAndKillWithAlly: match.stats.support.immobilizeAndKillWithAlly,
    }),
  };
}

/** @description 관련 원천 필드를 분석 소유 이름으로 옮기며 각 지표를 독립적으로 보존한다. */
function mapSurvivalAndWinLoss(
  match: PlayerMatch,
): Pick<AnalysisMatchInput, "survival" | "winLoss"> {
  return {
    survival: Object.freeze({
      deaths: match.stats.combat.deaths,
      singleDigitHpSurvivals: match.stats.survival.survivedSingleDigitHpCount,
      largeDamageSurvivals: match.stats.survival.tookLargeDamageSurvived,
      threeImmobilizationSurvivals:
        match.stats.survival.survivedThreeImmobilizesInFight,
      longestLifeSeconds: match.stats.survival.longestTimeSpentLiving,
    }),
    winLoss: Object.freeze({
      win: match.win,
      enemyMissingPings: match.stats.ping.enemyMissingPings,
      dangerPings: match.stats.ping.dangerPings,
      retreatPings: match.stats.ping.retreatPings,
      controlWardsBought: match.stats.vision.visionWardsBoughtInGame,
      wardsRemoved: match.stats.vision.wardsKilled,
      soloKills: match.stats.combat.soloKills,
    }),
  };
}
