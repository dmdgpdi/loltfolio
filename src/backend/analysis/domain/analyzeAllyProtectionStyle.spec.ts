import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { analyzeAllyProtectionStyle } from "./analyzeAllyProtectionStyle";
import { InvalidAnalysisValueError } from "./errors/InvalidAnalysisValueError";
import type { AllyProtectionRecord } from "./types/AllyProtectionRecord.type";

it("회복·보호막 피해 흡수·구출을 서로 다른 유효 표본에서 계산한다", () => {
  // Arrange
  const records: AllyProtectionRecord[] = [
    {
      healingToAllies: { status: "AVAILABLE", value: 0 },
      damageShieldedOnAllies: { status: "AVAILABLE", value: 100.5 },
      allySaves: { status: "UNKNOWN" },
    },
    {
      healingToAllies: { status: "AVAILABLE", value: 300 },
      damageShieldedOnAllies: { status: "NOT_PROVIDED" },
      allySaves: { status: "AVAILABLE", value: 3 },
    },
  ];

  // Act
  const result = analyzeAllyProtectionStyle(records);

  // Assert
  expect(result).toEqual(
    Result.succeed({
      matchCount: 2,
      averageHealingToAllies: {
        status: "AVAILABLE",
        sampleCount: 2,
        notProvidedCount: 0,
        unknownCount: 0,
        value: 150,
      },
      averageDamageShieldedOnAllies: {
        status: "AVAILABLE",
        sampleCount: 1,
        notProvidedCount: 1,
        unknownCount: 0,
        value: 100.5,
      },
      allySaves: {
        status: "AVAILABLE",
        sampleCount: 1,
        notProvidedCount: 0,
        unknownCount: 1,
        value: { total: 3, average: 3, maximum: 3, occurredMatchCount: 1 },
      },
    }),
  );
});

/** @description 모든 원천이 실제 0으로 확보된 입력이며 각 테스트가 독립적으로 변경한다. */
function zeroRecord(): AllyProtectionRecord {
  return {
    healingToAllies: { status: "AVAILABLE", value: 0 },
    damageShieldedOnAllies: { status: "AVAILABLE", value: 0 },
    allySaves: { status: "AVAILABLE", value: 0 },
  };
}

it.each([
  "healingToAllies",
  "damageShieldedOnAllies",
  "allySaves",
] as const)("%s의 잘못된 확보 값을 입력 오류로 전달한다", (key) => {
  // Arrange
  const input = zeroRecord();
  Reflect.set(input[key], "value", -1);

  // Act
  const result = analyzeAllyProtectionStyle([input]);

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
  const empty = analyzeAllyProtectionStyle([]);
  const missing = analyzeAllyProtectionStyle([input]);

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
  const result = analyzeAllyProtectionStyle([input]);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  const before = JSON.stringify(result.value);
  Reflect.set(input.healingToAllies, "value", 1);
  analyzeAllyProtectionStyle([input]);

  // Assert
  expectFrozen(result.value);
  expect(JSON.stringify(result.value)).toBe(before);
});
