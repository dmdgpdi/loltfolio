import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { analyzeWinLossComparison } from "./analyzeWinLossComparison";
import { InvalidAnalysisValueError } from "./errors/InvalidAnalysisValueError";
import type { WinLossRecord } from "./types/WinLossRecord.type";

/** @description 실제 0을 포함한 승패별 행동 관측을 만든다. */
function record(overrides: Partial<WinLossRecord> = {}): WinLossRecord {
  return {
    win: { status: "AVAILABLE", value: true },
    enemyMissingPings: { status: "AVAILABLE", value: 0 },
    dangerPings: { status: "NOT_PROVIDED" },
    retreatPings: { status: "UNKNOWN" },
    controlWardsBought: { status: "AVAILABLE", value: 2 },
    wardsRemoved: { status: "AVAILABLE", value: 4 },
    soloKills: { status: "AVAILABLE", value: 1 },
    ...overrides,
  };
}

/** @description 서로 다른 표본 상태의 비교용 경기 기록을 구성한다. */
function mixedRecords(): WinLossRecord[] {
  return [
    record(),
    record({ enemyMissingPings: { status: "AVAILABLE", value: 4 } }),
    record({
      win: { status: "AVAILABLE", value: false },
      enemyMissingPings: { status: "AVAILABLE", value: 8 },
      dangerPings: { status: "AVAILABLE", value: 3 },
    }),
    record({
      win: { status: "NOT_PROVIDED" },
      enemyMissingPings: { status: "AVAILABLE", value: 999 },
    }),
    record({ win: { status: "UNKNOWN" } }),
  ];
}

it("승패 집단·지표별 표본을 보존하고 승리 평균에서 패배 평균을 뺀다", () => {
  // Arrange
  const records = mixedRecords();

  // Act
  const result = analyzeWinLossComparison(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value).toMatchObject({
    matchCount: 5,
    winMatchCount: 2,
    lossMatchCount: 1,
    winNotProvidedMatchCount: 1,
    winUnknownMatchCount: 1,
  });
  expect(result.value.enemyMissingPings).toEqual({
    wins: {
      status: "AVAILABLE",
      sampleCount: 2,
      notProvidedCount: 0,
      unknownCount: 0,
      value: 2,
    },
    losses: {
      status: "AVAILABLE",
      sampleCount: 1,
      notProvidedCount: 0,
      unknownCount: 0,
      value: 8,
    },
    difference: { status: "AVAILABLE", value: -6 },
  });
  expect(result.value.dangerPings).toEqual({
    wins: {
      status: "UNAVAILABLE",
      sampleCount: 0,
      notProvidedCount: 2,
      unknownCount: 0,
    },
    losses: {
      status: "AVAILABLE",
      sampleCount: 1,
      notProvidedCount: 0,
      unknownCount: 0,
      value: 3,
    },
    difference: { status: "UNAVAILABLE" },
  });
  expect(result.value.retreatPings.wins).toMatchObject({ unknownCount: 2 });
  expect(result.value.controlWardsBought.difference).toEqual({
    status: "AVAILABLE",
    value: 0,
  });
  expect(result.value.wardsRemoved.wins).toMatchObject({ value: 4 });
  expect(result.value.soloKills.losses).toMatchObject({ value: 1 });
});

it("한 집단이 없으면 확보된 평균을 유지하고 차이만 제공하지 않는다", () => {
  // Arrange
  const records = [record()];

  // Act
  const result = analyzeWinLossComparison(records);

  // Assert
  expect(result).toMatchObject({
    value: {
      enemyMissingPings: {
        wins: { status: "AVAILABLE", value: 0 },
        losses: { status: "UNAVAILABLE" },
        difference: { status: "UNAVAILABLE" },
      },
    },
  });
});

it("미확보 승패를 패배로 바꾸지 않는다", () => {
  // Arrange
  const records = [record({ win: { status: "UNKNOWN" } })];

  // Act
  const result = analyzeWinLossComparison(records);

  // Assert
  expect(result).toMatchObject({
    value: {
      winMatchCount: 0,
      lossMatchCount: 0,
      winUnknownMatchCount: 1,
      soloKills: {
        wins: { status: "UNAVAILABLE", sampleCount: 0 },
        losses: { status: "UNAVAILABLE", sampleCount: 0 },
      },
    },
  });
});

it.each([
  "INVALID_WIN",
  "EXCLUDED_VALUE",
  "SUM_OVERFLOW",
] as const)("승패 비교의 %s 오류를 구분한다", (kind) => {
  // Arrange
  const input = record({ win: { status: "UNKNOWN" } });

  if (kind === "INVALID_WIN") {
    Reflect.set(input, "win", { status: "AVAILABLE", value: "true" });
  }

  if (kind === "EXCLUDED_VALUE") {
    Reflect.set(input.enemyMissingPings, "value", -1);
  }

  const records =
    kind === "SUM_OVERFLOW"
      ? [
          record({
            soloKills: { status: "AVAILABLE", value: Number.MAX_SAFE_INTEGER },
          }),
          record(),
        ]
      : [input];

  // Act
  const result = analyzeWinLossComparison(records);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(InvalidAnalysisValueError)));
});

/** @description 모든 원천이 실제 0으로 확보된 입력이며 각 테스트가 독립적으로 변경한다. */
function zeroRecord(): WinLossRecord {
  return {
    win: { status: "AVAILABLE", value: true },
    enemyMissingPings: { status: "AVAILABLE", value: 0 },
    dangerPings: { status: "AVAILABLE", value: 0 },
    retreatPings: { status: "AVAILABLE", value: 0 },
    controlWardsBought: { status: "AVAILABLE", value: 0 },
    wardsRemoved: { status: "AVAILABLE", value: 0 },
    soloKills: { status: "AVAILABLE", value: 0 },
  };
}

it.each([
  "enemyMissingPings",
  "dangerPings",
  "retreatPings",
  "controlWardsBought",
  "wardsRemoved",
  "soloKills",
] as const)("%s의 잘못된 확보 값을 입력 오류로 전달한다", (key) => {
  // Arrange
  const input = zeroRecord();
  Reflect.set(input[key], "value", -1);

  // Act
  const result = analyzeWinLossComparison([input]);

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
  const empty = analyzeWinLossComparison([]);
  const missing = analyzeWinLossComparison([input]);

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
  const result = analyzeWinLossComparison([input]);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  const before = JSON.stringify(result.value);
  Reflect.set(input.enemyMissingPings, "value", 1);
  analyzeWinLossComparison([input]);

  // Assert
  expectFrozen(result.value);
  expect(JSON.stringify(result.value)).toBe(before);
});
