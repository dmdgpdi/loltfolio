import { expect, it } from "vitest";
import { emptyPlayerMatchStats } from "../../../match/domain/emptyPlayerMatchStats";
import { PlayerMatch } from "../../../match/domain/PlayerMatch";
import type { PlayerMatchStats } from "../../../match/domain/types/PlayerMatchStats.type";
import { createPlayerMatchData } from "../../../match/testing/createPlayerMatchData";
import { toAnalysisMatchInput } from "./toAnalysisMatchInput";

/** @description 각 원천에 서로 다른 값을 부여해 비슷한 이름의 필드가 뒤바뀌는지 검출한다. */
function sourceStats(): PlayerMatchStats {
  const stats = structuredClone(emptyPlayerMatchStats());
  let value = 1;

  for (const group of Object.values(stats)) {
    for (const key of Object.keys(group)) {
      Reflect.set(group, key, { status: "AVAILABLE", value: value++ });
    }
  }

  for (const key of ["firstBloodKill", "firstBloodAssist"]) {
    Reflect.set(stats.combat, key, { status: "AVAILABLE", value: true });
  }

  for (const key of ["firstTowerKill", "firstTowerAssist"]) {
    Reflect.set(stats.objective, key, { status: "AVAILABLE", value: false });
  }

  return stats;
}

it("비슷한 이름의 원천 지표와 단위를 바꾸지 않고 모든 콘텐츠에 매핑한다", () => {
  // Arrange
  const stats = sourceStats();
  const match = new PlayerMatch(createPlayerMatchData({ stats }));

  // Act
  const input = toAnalysisMatchInput(match);

  // Assert
  expect(input.communication.retreat).toEqual(stats.ping.retreatPings);
  expect(input.communication.getBack).toEqual(stats.ping.getBackPings);
  expect(input.vision.controlWardsBought).toEqual(
    stats.vision.visionWardsBoughtInGame,
  );
  expect(input.vision.wardsRemoved).toEqual(stats.vision.wardsKilled);
  expect(input.vision.wardTakedownsBefore20Minutes).toEqual(
    stats.vision.wardTakedownsBefore20M,
  );
  expect(input.structure.firstTowerKill).toEqual(
    stats.objective.firstTowerKill,
  );
  expect(input.soloKill.soloKills).toEqual(stats.combat.soloKills);
  expect(input.firstBlood.kill).toEqual(stats.combat.firstBloodKill);
  expect(input.jungle.enemyJungleMonsterKills).toEqual(
    stats.jungle.enemyJungleMonsterKills,
  );
  expect(input.jungle.enemyJungleMinionsKilled).toEqual(
    stats.jungle.totalEnemyJungleMinionsKilled,
  );
  expect(input.jungle.earlyLanerKills).toEqual(
    stats.jungle.killsOnLanersEarlyJungleAsJungler,
  );
  expect(input.laning.maximumLevelLead).toEqual(
    stats.laning.maxLevelLeadLaneOpponent,
  );
});

it("전투·생존·지원·선택 원천을 각 분석 입력에 연결한다", () => {
  // Arrange
  const stats = sourceStats();
  const match = new PlayerMatch(createPlayerMatchData({ stats }));

  // Act
  const input = toAnalysisMatchInput(match);

  // Assert
  expect(input.outnumberedKill.outnumberedKills).toEqual(
    stats.combat.outnumberedKills,
  );
  expect(input.enemyTowerKill.killsNearEnemyTower).toEqual(
    stats.combat.killsNearEnemyTurret,
  );
  expect(input.ownTowerKill.killsUnderOwnTower).toEqual(
    stats.combat.killsUnderOwnTurret,
  );
  expect(input.skillshotDodge.skillshotsDodged).toEqual(
    stats.survival.skillshotsDodged,
  );
  expect(input.damageTaken.teamDamageTakenRatio).toEqual(
    stats.survival.damageTakenOnTeamPercentage,
  );
  expect(input.survival.deaths).toEqual(stats.combat.deaths);
  expect(input.survival.longestLifeSeconds).toEqual(
    stats.survival.longestTimeSpentLiving,
  );
  expect(input.allyProtection.damageShieldedOnAllies).toEqual(
    stats.support.totalDamageShieldedOnTeammates,
  );
  expect(input.crowdControl.immobilizations).toEqual(
    stats.support.enemyChampionImmobilizations,
  );
  expect(input.winLoss.dangerPings).toEqual(stats.ping.dangerPings);
  expect(input.winLoss.retreatPings).toEqual(stats.ping.retreatPings);
  expect(input.championPreference.championId).toEqual(match.championId);
  expect(input.position.position).toEqual(match.position);
});

it("Timeline 경험치 이름만 변환하고 실제 시각과 음수 골드 차이를 보존한다", () => {
  // Arrange
  const values = {
    gold: { status: "AVAILABLE", value: -500 },
    xp: { status: "AVAILABLE", value: -200 },
    level: { status: "AVAILABLE", value: -1 },
    laneCs: { status: "UNKNOWN" },
    jungleCs: { status: "NOT_PROVIDED" },
  } as const;
  const match = new PlayerMatch(
    createPlayerMatchData({
      laningSnapshots: [
        {
          minute: 15,
          actualTimestampMs: { status: "AVAILABLE", value: 900300 },
          own: { status: "NOT_PROVIDED" },
          opponentDifference: { status: "AVAILABLE", value: values },
        },
      ],
    }),
  );

  // Act
  const input = toAnalysisMatchInput(match);

  // Assert
  expect(input.comeback.goldDifferenceAt15Minutes).toEqual(values.gold);
  expect(input.laning.points.find(({ minute }) => minute === 15)).toEqual({
    minute: 15,
    actualTimestampMs: { status: "AVAILABLE", value: 900300 },
    own: { status: "NOT_PROVIDED" },
    opponentDifference: {
      status: "AVAILABLE",
      value: {
        gold: values.gold,
        experience: values.xp,
        level: values.level,
        laneCs: values.laneCs,
        jungleCs: values.jungleCs,
      },
    },
  });
});

it.each([
  420, 440,
] as const)("협곡 랭크 큐 %s만 라인전 규칙에 매핑한다", (queueId) => {
  // Arrange
  const match = new PlayerMatch(createPlayerMatchData({ queueId }));

  // Act
  const input = toAnalysisMatchInput(match);

  // Assert
  expect(input.laning.gameRule).toBe(
    queueId === 420 ? "SOLO_RANKED" : "FLEX_RANKED",
  );
});

it("큐가 랭크여도 맵·규칙이 미확보면 라인전 대상이라고 추정하지 않는다", () => {
  // Arrange
  const match = new PlayerMatch(
    createPlayerMatchData({ mapId: { status: "UNKNOWN" } }),
  );

  // Act
  const input = toAnalysisMatchInput(match);

  // Assert
  expect(input.laning.gameRule).toBe("OTHER");
});

it("칼바람의 포지션 없음과 비교 불가를 보존하고 본인 통계를 지우지 않는다", () => {
  // Arrange
  const match = new PlayerMatch(
    createPlayerMatchData({
      queueId: 450,
      mapId: { status: "AVAILABLE", value: 12 },
      gameMode: { status: "AVAILABLE", value: "ARAM" },
      stats: sourceStats(),
    }),
  );

  // Act
  const input = toAnalysisMatchInput(match);

  // Assert
  expect(input.position.position).toEqual({
    status: "AVAILABLE",
    value: "NONE",
  });
  expect(input.laning.gameRule).toBe("OTHER");
  expect(input.comeback.goldDifferenceAt15Minutes).toEqual({
    status: "UNKNOWN",
  });
  expect(input.communication.enemyMissing.status).toBe("AVAILABLE");
});

it("전부 미제공인 원천을 0으로 바꾸지 않고 중첩 입력도 동결한다", () => {
  // Arrange
  const match = new PlayerMatch(createPlayerMatchData());

  // Act
  const input = toAnalysisMatchInput(match);

  // Assert
  expect(input.vision.wardsPlaced).toEqual({ status: "NOT_PROVIDED" });
  expect(Object.isFrozen(input)).toBe(true);
  expect(Object.isFrozen(input.communication)).toBe(true);
  expect(Object.isFrozen(input.laning.points)).toBe(true);
  expect(Object.isFrozen(input.laning.points[0])).toBe(true);
});
