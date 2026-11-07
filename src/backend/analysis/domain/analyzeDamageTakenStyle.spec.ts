import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { analyzeDamageTakenStyle } from "./analyzeDamageTakenStyle";
import { InvalidAnalysisValueError } from "./errors/InvalidAnalysisValueError";
import type { DamageTakenRecord } from "./types/DamageTakenRecord.type";

it("피해·경감량을 분리하고 팀 비중은 경기별 비율의 평균을 백분율로 바꾼다", () => {
  // Arrange
  const records: DamageTakenRecord[] = [
    {
      damageTaken: { status: "AVAILABLE", value: 100 },
      damageMitigated: { status: "NOT_PROVIDED" },
      teamDamageTakenRatio: { status: "AVAILABLE", value: 0.2 },
    },
    {
      damageTaken: { status: "UNKNOWN" },
      damageMitigated: { status: "AVAILABLE", value: 20.5 },
      teamDamageTakenRatio: { status: "AVAILABLE", value: 0.8 },
    },
  ];

  // Act
  const result = analyzeDamageTakenStyle(records);

  // Assert
  expect(result).toEqual(
    Result.succeed({
      matchCount: 2,
      averageDamageTaken: {
        status: "AVAILABLE",
        sampleCount: 1,
        notProvidedCount: 0,
        unknownCount: 1,
        value: 100,
      },
      averageDamageMitigated: {
        status: "AVAILABLE",
        sampleCount: 1,
        notProvidedCount: 1,
        unknownCount: 0,
        value: 20.5,
      },
      averageTeamDamageTakenPercentage: {
        status: "AVAILABLE",
        sampleCount: 2,
        notProvidedCount: 0,
        unknownCount: 0,
        value: 50,
      },
    }),
  );
});

it.each([
  -0.1,
  1.1,
  NaN,
  Infinity,
])("범위를 벗어난 팀 피해 원비율 %s를 거부한다", (value) => {
  // Arrange
  const record: DamageTakenRecord = {
    damageTaken: { status: "NOT_PROVIDED" },
    damageMitigated: { status: "NOT_PROVIDED" },
    teamDamageTakenRatio: { status: "AVAILABLE", value },
  };

  // Act
  const result = analyzeDamageTakenStyle([record]);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(InvalidAnalysisValueError)));
});

/** @description 모든 원천이 실제 0으로 확보된 입력이며 각 테스트가 독립적으로 변경한다. */
function zeroRecord(): DamageTakenRecord {
  return {
    damageTaken: { status: "AVAILABLE", value: 0 },
    damageMitigated: { status: "AVAILABLE", value: 0 },
    teamDamageTakenRatio: { status: "AVAILABLE", value: 0 },
  };
}

it.each([
  "damageTaken",
  "damageMitigated",
  "teamDamageTakenRatio",
] as const)("%s의 잘못된 확보 값을 입력 오류로 전달한다", (key) => {
  // Arrange
  const input = zeroRecord();
  Reflect.set(input[key], "value", -1);

  // Act
  const result = analyzeDamageTakenStyle([input]);

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
  const empty = analyzeDamageTakenStyle([]);
  const missing = analyzeDamageTakenStyle([input]);

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
  const result = analyzeDamageTakenStyle([input]);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  const before = JSON.stringify(result.value);
  Reflect.set(input.damageTaken, "value", 1);
  analyzeDamageTakenStyle([input]);

  // Assert
  expectFrozen(result.value);
  expect(JSON.stringify(result.value)).toBe(before);
});

it.each([
  0, 1,
])("팀 피해 원비율의 경계 %s를 허용하고 백분율로 변환한다", (value) => {
  // Arrange
  const input = zeroRecord();
  Reflect.set(input.teamDamageTakenRatio, "value", value);

  // Act
  const result = analyzeDamageTakenStyle([input]);

  // Assert
  expect(result).toMatchObject({
    value: {
      averageTeamDamageTakenPercentage: {
        status: "AVAILABLE",
        value: value * 100,
      },
    },
  });
});
