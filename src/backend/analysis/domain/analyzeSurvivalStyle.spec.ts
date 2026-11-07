import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { analyzeSurvivalStyle } from "./analyzeSurvivalStyle";
import { InvalidAnalysisValueError } from "./errors/InvalidAnalysisValueError";
import type { SurvivalRecord } from "./types/SurvivalRecord.type";

/** @description 서로 다른 표본 상태의 비교용 경기 기록을 구성한다. */
function mixedRecords(): SurvivalRecord[] {
  return [
    {
      deaths: { status: "AVAILABLE", value: 0 },
      singleDigitHpSurvivals: { status: "AVAILABLE", value: 2 },
      largeDamageSurvivals: { status: "AVAILABLE", value: 4 },
      threeImmobilizationSurvivals: { status: "UNKNOWN" },
      longestLifeSeconds: { status: "AVAILABLE", value: 120.5 },
    },
    {
      deaths: { status: "AVAILABLE", value: 2 },
      singleDigitHpSurvivals: { status: "NOT_PROVIDED" },
      largeDamageSurvivals: { status: "AVAILABLE", value: 0 },
      threeImmobilizationSurvivals: { status: "AVAILABLE", value: 1 },
      longestLifeSeconds: { status: "AVAILABLE", value: 80.5 },
    },
    {
      deaths: { status: "UNKNOWN" },
      singleDigitHpSurvivals: { status: "UNKNOWN" },
      largeDamageSurvivals: { status: "NOT_PROVIDED" },
      threeImmobilizationSurvivals: { status: "NOT_PROVIDED" },
      longestLifeSeconds: { status: "NOT_PROVIDED" },
    },
  ];
}

it("실제 0데스만 무데스로 세고 서로 겹치는 생존 기록을 독립 집계한다", () => {
  // Arrange
  const records = mixedRecords();

  // Act
  const result = analyzeSurvivalStyle(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.deathlessMatches).toEqual({
    status: "AVAILABLE",
    sampleCount: 2,
    notProvidedCount: 0,
    unknownCount: 1,
    value: { matchedMatchCount: 1, percentage: 50 },
  });
  expect(result.value.deaths).toMatchObject({
    value: { total: 2, maximum: 2, average: 1 },
  });
  expect(result.value.singleDigitHpSurvivals).toMatchObject({
    sampleCount: 1,
    notProvidedCount: 1,
    unknownCount: 1,
    value: { total: 2 },
  });
  expect(result.value.largeDamageSurvivals).toMatchObject({
    sampleCount: 2,
    value: { total: 4, occurredMatchCount: 1 },
  });
  expect(result.value.threeImmobilizationSurvivals).toMatchObject({
    sampleCount: 1,
    unknownCount: 1,
    notProvidedCount: 1,
    value: { total: 1 },
  });
  expect(result.value.averageLongestLifeSeconds).toEqual({
    status: "AVAILABLE",
    sampleCount: 2,
    notProvidedCount: 1,
    unknownCount: 0,
    value: 100.5,
  });
});

/** @description 모든 원천이 실제 0으로 확보된 입력이며 각 테스트가 독립적으로 변경한다. */
function zeroRecord(): SurvivalRecord {
  return {
    deaths: { status: "AVAILABLE", value: 0 },
    singleDigitHpSurvivals: { status: "AVAILABLE", value: 0 },
    largeDamageSurvivals: { status: "AVAILABLE", value: 0 },
    threeImmobilizationSurvivals: { status: "AVAILABLE", value: 0 },
    longestLifeSeconds: { status: "AVAILABLE", value: 0 },
  };
}

it.each([
  "deaths",
  "singleDigitHpSurvivals",
  "largeDamageSurvivals",
  "threeImmobilizationSurvivals",
  "longestLifeSeconds",
] as const)("%s의 잘못된 확보 값을 입력 오류로 전달한다", (key) => {
  // Arrange
  const input = zeroRecord();
  Reflect.set(input[key], "value", -1);

  // Act
  const result = analyzeSurvivalStyle([input]);

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
  const empty = analyzeSurvivalStyle([]);
  const missing = analyzeSurvivalStyle([input]);

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
  const result = analyzeSurvivalStyle([input]);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  const before = JSON.stringify(result.value);
  Reflect.set(input.deaths, "value", 1);
  analyzeSurvivalStyle([input]);

  // Assert
  expectFrozen(result.value);
  expect(JSON.stringify(result.value)).toBe(before);
});
