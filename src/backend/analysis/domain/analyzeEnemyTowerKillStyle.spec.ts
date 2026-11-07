import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { analyzeEnemyTowerKillStyle } from "./analyzeEnemyTowerKillStyle";
import { InvalidAnalysisValueError } from "./errors/InvalidAnalysisValueError";
import type { EnemyTowerKillRecord } from "./types/EnemyTowerKillRecord.type";

it("공통 표본 합계로 비중을 계산하고 독립 처치 통계와 구분한다", () => {
  // Arrange
  const records: EnemyTowerKillRecord[] = [
    {
      killsNearEnemyTower: { status: "AVAILABLE", value: 1 },
      kills: { status: "AVAILABLE", value: 2 },
    },
    {
      killsNearEnemyTower: { status: "AVAILABLE", value: 3 },
      kills: { status: "AVAILABLE", value: 18 },
    },
    {
      killsNearEnemyTower: { status: "AVAILABLE", value: 6 },
      kills: { status: "UNKNOWN" },
    },
    {
      killsNearEnemyTower: { status: "NOT_PROVIDED" },
      kills: { status: "AVAILABLE", value: 10 },
    },
  ];

  // Act
  const result = analyzeEnemyTowerKillStyle(records);

  // Assert
  expect(result).toEqual(
    Result.succeed({
      matchCount: 4,
      killsNearEnemyTower: {
        status: "AVAILABLE",
        sampleCount: 3,
        notProvidedCount: 1,
        unknownCount: 0,
        value: {
          total: 10,
          average: 10 / 3,
          maximum: 6,
          occurredMatchCount: 3,
        },
      },
      shareOfKills: {
        status: "AVAILABLE",
        sampleCount: 2,
        excludedMatchCount: 2,
        numerator: 4,
        denominator: 20,
        percentage: 20,
      },
    }),
  );
});

it("미확보 공통 표본과 실제 0킬 분모를 구분한다", () => {
  // Arrange
  const missing: EnemyTowerKillRecord = {
    killsNearEnemyTower: { status: "NOT_PROVIDED" },
    kills: { status: "UNKNOWN" },
  };
  const zero: EnemyTowerKillRecord = {
    killsNearEnemyTower: { status: "AVAILABLE", value: 0 },
    kills: { status: "AVAILABLE", value: 0 },
  };

  // Act
  const noSamples = analyzeEnemyTowerKillStyle([missing]);
  const zeroKills = analyzeEnemyTowerKillStyle([zero]);

  // Assert
  expect(noSamples).toMatchObject({
    value: {
      shareOfKills: {
        status: "UNAVAILABLE",
        reason: "NO_VALID_SAMPLES",
        sampleCount: 0,
        excludedMatchCount: 1,
      },
    },
  });
  expect(zeroKills).toMatchObject({
    value: {
      shareOfKills: {
        status: "UNAVAILABLE",
        reason: "ZERO_DENOMINATOR",
        sampleCount: 1,
        excludedMatchCount: 0,
      },
    },
  });
});

it.each([
  "EXCESS",
  "INVALID_EXCLUDED",
  "OVERFLOW",
] as const)("비중 입력의 %s 오류를 숨기지 않는다", (kind) => {
  // Arrange
  const records: EnemyTowerKillRecord[] =
    kind === "EXCESS"
      ? [
          {
            killsNearEnemyTower: { status: "AVAILABLE", value: 2 },
            kills: { status: "AVAILABLE", value: 1 },
          },
        ]
      : kind === "INVALID_EXCLUDED"
        ? [
            {
              killsNearEnemyTower: { status: "UNKNOWN" },
              kills: { status: "AVAILABLE", value: -1 },
            },
          ]
        : Array.from({ length: 2 }, () => ({
            killsNearEnemyTower: { status: "AVAILABLE", value: 1 },
            kills: { status: "AVAILABLE", value: Number.MAX_SAFE_INTEGER },
          }));

  // Act
  const result = analyzeEnemyTowerKillStyle(records);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(InvalidAnalysisValueError)));
});

/** @description 모든 원천이 실제 0으로 확보된 입력이며 각 테스트가 독립적으로 변경한다. */
function zeroRecord(): EnemyTowerKillRecord {
  return {
    killsNearEnemyTower: { status: "AVAILABLE", value: 0 },
    kills: { status: "AVAILABLE", value: 0 },
  };
}

it.each([
  "killsNearEnemyTower",
  "kills",
] as const)("%s의 잘못된 확보 값을 입력 오류로 전달한다", (key) => {
  // Arrange
  const input = zeroRecord();
  Reflect.set(input[key], "value", -1);

  // Act
  const result = analyzeEnemyTowerKillStyle([input]);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(InvalidAnalysisValueError)));
});

it("빈 입력과 전부 미제공인 관측은 수치를 만들지 않는다", () => {
  // Arrange
  const input = zeroRecord();

  for (const key of Object.keys(input)) {
    Reflect.set(input, key, { status: "NOT_PROVIDED" });
  }

  // Act
  const empty = analyzeEnemyTowerKillStyle([]);
  const missing = analyzeEnemyTowerKillStyle([input]);

  if (Result.isFailure(empty)) {
    throw empty.error;
  }

  if (Result.isFailure(missing)) {
    throw missing.error;
  }

  // Assert
  expect(empty.value.matchCount).toBe(0);
  expect(missing.value.matchCount).toBe(1);
  expect(JSON.stringify(empty.value)).not.toContain('"status":"AVAILABLE"');
  expect(JSON.stringify(missing.value)).not.toContain('"status":"AVAILABLE"');
});

/** @description 반환 그래프 전체를 확인해 중첩 지표의 런타임 불변성 누락을 검출한다. */
function expectFrozen(value: unknown): void {
  if (value === null || typeof value !== "object") {
    return;
  }

  expect(Object.isFrozen(value)).toBe(true);

  for (const child of Object.values(value)) {
    expectFrozen(child);
  }
}

it("반환 그래프를 동결하고 원본 변경 및 후속 계산과 분리한다", () => {
  // Arrange
  const input = zeroRecord();

  // Act
  const result = analyzeEnemyTowerKillStyle([input]);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  const before = JSON.stringify(result.value);
  Reflect.set(input.killsNearEnemyTower, "value", 1);
  analyzeEnemyTowerKillStyle([input]);

  // Assert
  expectFrozen(result.value);
  expect(JSON.stringify(result.value)).toBe(before);
});
