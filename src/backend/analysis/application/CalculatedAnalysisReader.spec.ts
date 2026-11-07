import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { emptyPlayerMatchStats } from "../../match/domain/emptyPlayerMatchStats";
import { PlayerMatch } from "../../match/domain/PlayerMatch";
import { createPlayerMatchData } from "../../match/testing/createPlayerMatchData";
import { StoredAnalysisInputReader } from "../infrastructure/match/StoredAnalysisInputReader";
import { toAnalysisMatchInput } from "../infrastructure/match/toAnalysisMatchInput";
import { CalculatedAnalysisReader } from "./CalculatedAnalysisReader";
import { AnalysisCalculationError } from "./errors/AnalysisCalculationError";
import { AnalysisReadError } from "./errors/AnalysisReadError";
import type { AnalysisInputSet } from "./types/AnalysisInputSet.type";

it("읽기 입력에서 19개 결과를 계산하고 실제 표본과 원래 범위를 DTO로 반환한다", async () => {
  // Arrange
  const match = new PlayerMatch(createPlayerMatchData());
  const source: AnalysisInputSet = {
    selectedMatchIds: ["KR_failed", match.matchId],
    matches: [toAnalysisMatchInput(match)],
  };
  const calls: unknown[] = [];
  const reader = new CalculatedAnalysisReader({
    findLatest: async (target) => {
      calls.push(target);
      return Result.succeed(source);
    },
  });

  // Act
  const result = await reader.findLatest({ puuid: "player", queueId: 420 });

  if (Result.isFailure(result) || result.value === null) {
    throw new Error("DTO를 반환해야 합니다.");
  }

  // Assert
  expect(calls).toEqual([{ puuid: "player", queueId: 420 }]);
  expect(result.value.selectedMatchIds).toEqual(["KR_failed", "KR_1"]);
  expect(result.value.analyzedMatchIds).toEqual(["KR_1"]);
  expect(result.value.championPreference.mostPlayedChampions).toEqual([103]);
  expect(result.value.vision.matchCount).toBe(1);
  expect(result.value.winLoss.winMatchCount).toBe(1);
  expect(Object.keys(result.value)).toHaveLength(22);
  expect(Object.getPrototypeOf(result.value.communication)).toBe(
    Object.prototype,
  );
  expect(JSON.parse(JSON.stringify(result.value))).toEqual(result.value);
});

it("완료 표본 부재와 정상 빈 완료를 구분한다", async () => {
  // Arrange
  const absent = new CalculatedAnalysisReader({
    findLatest: async () => Result.succeed(null),
  });
  const empty = new CalculatedAnalysisReader({
    findLatest: async () =>
      Result.succeed({ selectedMatchIds: [], matches: [] }),
  });
  const target = { puuid: "player", queueId: 420 } as const;

  // Act
  const noSelection = await absent.findLatest(target);
  const zeroMatches = await empty.findLatest(target);

  // Assert
  expect(noSelection).toEqual(Result.succeed(null));
  expect(zeroMatches).toMatchObject({
    value: {
      analyzedMatchIds: [],
      position: { matchCount: 0 },
      vision: { matchCount: 0 },
      jungle: { jungleMatchCount: 0 },
    },
  });
});

it("읽기 오류를 부재로 숨기지 않는다", async () => {
  // Arrange
  const error = new AnalysisReadError();
  const reader = new CalculatedAnalysisReader({
    findLatest: async () => Result.fail(error),
  });

  // Act
  const result = await reader.findLatest({ puuid: "player", queueId: 420 });

  // Assert
  expect(result).toEqual(Result.fail(error));
});

it("도메인 입력 오류는 계산 실패로 원인을 보존한다", async () => {
  // Arrange
  const stats = structuredClone(emptyPlayerMatchStats());
  Reflect.set(stats.vision, "wardsPlaced", { status: "AVAILABLE", value: -1 });
  const match = new PlayerMatch(createPlayerMatchData({ stats }));
  const reader = new CalculatedAnalysisReader({
    findLatest: async () =>
      Result.succeed({
        selectedMatchIds: [match.matchId],
        matches: [toAnalysisMatchInput(match)],
      }),
  });

  // Act
  const result = await reader.findLatest({ puuid: "player", queueId: 420 });

  // Assert
  expect(result).toEqual(Result.fail(expect.any(AnalysisCalculationError)));

  if (Result.isFailure(result)) {
    expect(result.error.cause).toBeInstanceOf(Error);
  }
});

it("DTO와 중첩 결과를 동결하고 원본 배열 변경과 다른 조회에서 분리한다", async () => {
  // Arrange
  const ids = ["KR_1"];
  const reader = new CalculatedAnalysisReader({
    findLatest: async () =>
      Result.succeed({ selectedMatchIds: ids, matches: [] }),
  });
  const target = { puuid: "player", queueId: 420 } as const;

  // Act
  const result = await reader.findLatest(target);
  ids.push("KR_2");
  await reader.findLatest(target);

  if (Result.isFailure(result) || result.value === null) {
    throw new Error("DTO를 반환해야 합니다.");
  }

  // Assert
  expect(result.value.selectedMatchIds).toEqual(["KR_1"]);
  expect(Object.isFrozen(result.value)).toBe(true);
  expect(Object.isFrozen(result.value.target)).toBe(true);
  expect(Object.isFrozen(result.value.selectedMatchIds)).toBe(true);
  expect(Object.isFrozen(result.value.championPreference)).toBe(true);
});

/** @description 서로 다른 단위와 처치 조합이 있는 실제 도메인 경기 fixture로 연결 경계를 검증한다. */
function observedMatch(): PlayerMatch {
  const stats = structuredClone(emptyPlayerMatchStats());
  Reflect.set(stats.ping, "enemyMissingPings", {
    status: "AVAILABLE",
    value: 4,
  });
  Reflect.set(stats.vision, "wardsPlaced", { status: "AVAILABLE", value: 3 });
  Reflect.set(stats.combat, "soloKills", { status: "AVAILABLE", value: 2 });
  Reflect.set(stats.combat, "kills", { status: "AVAILABLE", value: 10 });
  Reflect.set(stats.combat, "killsNearEnemyTurret", {
    status: "AVAILABLE",
    value: 3,
  });
  Reflect.set(stats.combat, "firstBloodKill", {
    status: "AVAILABLE",
    value: true,
  });
  Reflect.set(stats.objective, "firstTowerAssist", {
    status: "AVAILABLE",
    value: true,
  });
  Reflect.set(stats.survival, "damageTakenOnTeamPercentage", {
    status: "AVAILABLE",
    value: 0.2,
  });
  return new PlayerMatch(createPlayerMatchData({ stats }));
}

it("저장 경기 공개 경계부터 DTO까지 단위·공통 표본·확정 관여를 유지한다", async () => {
  // Arrange
  const match = observedMatch();
  const inputs = new StoredAnalysisInputReader({
    findLatest: async () =>
      Result.succeed({ selectedMatchIds: [match.matchId], matches: [match] }),
  });
  const reader = new CalculatedAnalysisReader(inputs);

  // Act
  const result = await reader.findLatest({ puuid: "player", queueId: 420 });

  if (Result.isFailure(result) || result.value === null) {
    throw new Error("DTO를 반환해야 합니다.");
  }

  // Assert
  expect(result.value.communication.pings.enemyMissing).toMatchObject({
    total: 4,
    sampleCount: 1,
  });
  expect(result.value.vision.activities.wardsPlaced).toMatchObject({
    total: 3,
  });
  expect(result.value.soloKill.share).toMatchObject({
    soloKillTotal: 2,
    killTotal: 10,
    percentage: 20,
  });
  expect(result.value.enemyTowerKill.shareOfKills).toMatchObject({
    numerator: 3,
    denominator: 10,
    percentage: 30,
  });
  expect(result.value.firstBlood.participation).toMatchObject({
    participatedMatchCount: 1,
    percentage: 100,
  });
  expect(result.value.structure.firstTowerParticipation).toMatchObject({
    participatedMatchCount: 1,
    percentage: 100,
  });
  expect(
    result.value.damageTaken.averageTeamDamageTakenPercentage,
  ).toMatchObject({ value: 20 });
});
