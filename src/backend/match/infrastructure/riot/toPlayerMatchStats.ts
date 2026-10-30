import { toProvidedStat } from "../../domain/toProvidedStat";
import type { PlayerMatchStats } from "../../domain/types/PlayerMatchStats.type";
import type { SelectedParticipant } from "./SelectedParticipant.type";

/** @description 선택한 원본 통계를 상태와 함께 보존하고 미제공 값을 실제 0과 구분한다. */
export function toPlayerMatchStats(
  participant: SelectedParticipant,
): PlayerMatchStats {
  return {
    ping: {
      enemyMissingPings: toProvidedStat(participant.enemyMissingPings),
      dangerPings: toProvidedStat(participant.dangerPings),
      retreatPings: toProvidedStat(participant.retreatPings),
      getBackPings: toProvidedStat(participant.getBackPings),
      onMyWayPings: toProvidedStat(participant.onMyWayPings),
      allInPings: toProvidedStat(participant.allInPings),
      assistMePings: toProvidedStat(participant.assistMePings),
      commandPings: toProvidedStat(participant.commandPings),
      enemyVisionPings: toProvidedStat(participant.enemyVisionPings),
      needVisionPings: toProvidedStat(participant.needVisionPings),
      pushPings: toProvidedStat(participant.pushPings),
      holdPings: toProvidedStat(participant.holdPings),
    },
    vision: {
      visionWardsBoughtInGame: toProvidedStat(
        participant.visionWardsBoughtInGame,
      ),
      wardsPlaced: toProvidedStat(participant.wardsPlaced),
      wardsKilled: toProvidedStat(participant.wardsKilled),
      visionScore: toProvidedStat(participant.visionScore),
      detectorWardsPlaced: toProvidedStat(participant.detectorWardsPlaced),
      controlWardsPlaced: toProvidedStat(
        participant.challenges?.controlWardsPlaced ?? null,
      ),
      controlWardTimeCoverageInRiverOrEnemyHalf: toProvidedStat(
        participant.challenges?.controlWardTimeCoverageInRiverOrEnemyHalf ??
          null,
      ),
      visionScoreAdvantageLaneOpponent: toProvidedStat(
        participant.challenges?.visionScoreAdvantageLaneOpponent ?? null,
      ),
      highestWardKills: toProvidedStat(
        participant.challenges?.highestWardKills ?? null,
      ),
      wardTakedownsBefore20M: toProvidedStat(
        participant.challenges?.wardTakedownsBefore20M ?? null,
      ),
      twoWardsOneSweeperCount: toProvidedStat(
        participant.challenges?.twoWardsOneSweeperCount ?? null,
      ),
      threeWardsOneSweeperCount: toProvidedStat(
        participant.challenges?.threeWardsOneSweeperCount ?? null,
      ),
    },
    combat: {
      kills: toProvidedStat(participant.kills),
      deaths: toProvidedStat(participant.deaths),
      assists: toProvidedStat(participant.assists),
      totalDamageDealtToChampions: toProvidedStat(
        participant.totalDamageDealtToChampions,
      ),
      kda: toProvidedStat(participant.challenges?.kda ?? null),
      killParticipation: toProvidedStat(
        participant.challenges?.killParticipation ?? null,
      ),
      soloKills: toProvidedStat(participant.challenges?.soloKills ?? null),
      quickSoloKills: toProvidedStat(
        participant.challenges?.quickSoloKills ?? null,
      ),
      outnumberedKills: toProvidedStat(
        participant.challenges?.outnumberedKills ?? null,
      ),
      killsNearEnemyTurret: toProvidedStat(
        participant.challenges?.killsNearEnemyTurret ?? null,
      ),
      killsUnderOwnTurret: toProvidedStat(
        participant.challenges?.killsUnderOwnTurret ?? null,
      ),
      pickKillWithAlly: toProvidedStat(
        participant.challenges?.pickKillWithAlly ?? null,
      ),
      acesBefore15Minutes: toProvidedStat(
        participant.challenges?.acesBefore15Minutes ?? null,
      ),
      flawlessAces: toProvidedStat(
        participant.challenges?.flawlessAces ?? null,
      ),
      fastestLegendary: toProvidedStat(
        participant.challenges?.fastestLegendary ?? null,
      ),
      highestChampionDamage: toProvidedStat(
        participant.challenges?.highestChampionDamage ?? null,
      ),
      firstBloodKill: toProvidedStat(participant.firstBloodKill),
      firstBloodAssist: toProvidedStat(participant.firstBloodAssist),
    },
    laning: {
      earlyLaningPhaseGoldExpAdvantage: toProvidedStat(
        participant.challenges?.earlyLaningPhaseGoldExpAdvantage ?? null,
      ),
      laningPhaseGoldExpAdvantage: toProvidedStat(
        participant.challenges?.laningPhaseGoldExpAdvantage ?? null,
      ),
      maxCsAdvantageOnLaneOpponent: toProvidedStat(
        participant.challenges?.maxCsAdvantageOnLaneOpponent ?? null,
      ),
      maxLevelLeadLaneOpponent: toProvidedStat(
        participant.challenges?.maxLevelLeadLaneOpponent ?? null,
      ),
      laneMinionsFirst10Minutes: toProvidedStat(
        participant.challenges?.laneMinionsFirst10Minutes ?? null,
      ),
      goldPerMinute: toProvidedStat(
        participant.challenges?.goldPerMinute ?? null,
      ),
      killsOnOtherLanesEarlyJungleAsLaner: toProvidedStat(
        participant.challenges?.killsOnOtherLanesEarlyJungleAsLaner ?? null,
      ),
    },
    jungle: {
      totalEnemyJungleMinionsKilled: toProvidedStat(
        participant.totalEnemyJungleMinionsKilled,
      ),
      enemyJungleMonsterKills: toProvidedStat(
        participant.challenges?.enemyJungleMonsterKills ?? null,
      ),
      jungleCsBefore10Minutes: toProvidedStat(
        participant.challenges?.jungleCsBefore10Minutes ?? null,
      ),
      junglerKillsEarlyJungle: toProvidedStat(
        participant.challenges?.junglerKillsEarlyJungle ?? null,
      ),
      killsOnLanersEarlyJungleAsJungler: toProvidedStat(
        participant.challenges?.killsOnLanersEarlyJungleAsJungler ?? null,
      ),
      scuttleCrabKills: toProvidedStat(
        participant.challenges?.scuttleCrabKills ?? null,
      ),
      buffsStolen: toProvidedStat(participant.challenges?.buffsStolen ?? null),
    },
    objective: {
      turretTakedowns: toProvidedStat(participant.turretTakedowns),
      inhibitorTakedowns: toProvidedStat(participant.inhibitorTakedowns),
      damageDealtToTurrets: toProvidedStat(participant.damageDealtToTurrets),
      objectivesStolen: toProvidedStat(participant.objectivesStolen),
      dragonTakedowns: toProvidedStat(
        participant.challenges?.dragonTakedowns ?? null,
      ),
      baronTakedowns: toProvidedStat(
        participant.challenges?.baronTakedowns ?? null,
      ),
      epicMonsterSteals: toProvidedStat(
        participant.challenges?.epicMonsterSteals ?? null,
      ),
      earliestBaron: toProvidedStat(
        participant.challenges?.earliestBaron ?? null,
      ),
      earliestDragonTakedown: toProvidedStat(
        participant.challenges?.earliestDragonTakedown ?? null,
      ),
      firstTurretKilled: toProvidedStat(
        participant.challenges?.firstTurretKilled ?? null,
      ),
      firstTurretKilledTime: toProvidedStat(
        participant.challenges?.firstTurretKilledTime ?? null,
      ),
      quickFirstTurret: toProvidedStat(
        participant.challenges?.quickFirstTurret ?? null,
      ),
      turretPlatesTaken: toProvidedStat(
        participant.challenges?.turretPlatesTaken ?? null,
      ),
      baronBuffGoldAdvantageOverThreshold: toProvidedStat(
        participant.challenges?.baronBuffGoldAdvantageOverThreshold ?? null,
      ),
      firstTowerKill: toProvidedStat(participant.firstTowerKill),
      firstTowerAssist: toProvidedStat(participant.firstTowerAssist),
    },
    survival: {
      totalDamageTaken: toProvidedStat(participant.totalDamageTaken),
      damageSelfMitigated: toProvidedStat(participant.damageSelfMitigated),
      longestTimeSpentLiving: toProvidedStat(
        participant.longestTimeSpentLiving,
      ),
      damageTakenOnTeamPercentage: toProvidedStat(
        participant.challenges?.damageTakenOnTeamPercentage ?? null,
      ),
      survivedSingleDigitHpCount: toProvidedStat(
        participant.challenges?.survivedSingleDigitHpCount ?? null,
      ),
      tookLargeDamageSurvived: toProvidedStat(
        participant.challenges?.tookLargeDamageSurvived ?? null,
      ),
      survivedThreeImmobilizesInFight: toProvidedStat(
        participant.challenges?.survivedThreeImmobilizesInFight ?? null,
      ),
      skillshotsDodged: toProvidedStat(
        participant.challenges?.skillshotsDodged ?? null,
      ),
    },
    support: {
      totalHealsOnTeammates: toProvidedStat(participant.totalHealsOnTeammates),
      totalDamageShieldedOnTeammates: toProvidedStat(
        participant.totalDamageShieldedOnTeammates,
      ),
      timeCCingOthers: toProvidedStat(participant.timeCCingOthers),
      saveAllyFromDeath: toProvidedStat(
        participant.challenges?.saveAllyFromDeath ?? null,
      ),
      enemyChampionImmobilizations: toProvidedStat(
        participant.challenges?.enemyChampionImmobilizations ?? null,
      ),
      highestCrowdControlScore: toProvidedStat(
        participant.challenges?.highestCrowdControlScore ?? null,
      ),
      immobilizeAndKillWithAlly: toProvidedStat(
        participant.challenges?.immobilizeAndKillWithAlly ?? null,
      ),
    },
  };
}
