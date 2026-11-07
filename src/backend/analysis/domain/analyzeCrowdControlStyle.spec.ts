import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { analyzeCrowdControlStyle } from "./analyzeCrowdControlStyle";
import { InvalidAnalysisValueError } from "./errors/InvalidAnalysisValueError";
import type { CrowdControlRecord } from "./types/CrowdControlRecord.type";

it("CC 횟수·시간·아군 연계 처치를 합치지 않고 독립 계산한다", () => {
  // Arrange
  const records: CrowdControlRecord[] = [
    {
      immobilizations: { status: "AVAILABLE", value: 12 },
      crowdControlSeconds: { status: "AVAILABLE", value: 30.5 },
      immobilizeAndKillWithAlly: { status: "UNKNOWN" },
    },
    {
      immobilizations: { status: "AVAILABLE", value: 0 },
      crowdControlSeconds: { status: "NOT_PROVIDED" },
      immobilizeAndKillWithAlly: { status: "AVAILABLE", value: 2 },
    },
  ];

  // Act
  const result = analyzeCrowdControlStyle(records);

  // Assert
  expect(result).toEqual(
    Result.succeed({
      matchCount: 2,
      immobilizations: {
        status: "AVAILABLE",
        sampleCount: 2,
        notProvidedCount: 0,
        unknownCount: 0,
        value: { total: 12, average: 6, maximum: 12, occurredMatchCount: 1 },
      },
      averageCrowdControlSeconds: {
        status: "AVAILABLE",
        sampleCount: 1,
        notProvidedCount: 1,
        unknownCount: 0,
        value: 30.5,
      },
      immobilizeAndKillWithAlly: {
        status: "AVAILABLE",
        sampleCount: 1,
        notProvidedCount: 0,
        unknownCount: 1,
        value: { total: 2, average: 2, maximum: 2, occurredMatchCount: 1 },
      },
    }),
  );
});

/** @description 모든 원천이 실제 0으로 확보된 입력이며 각 테스트가 독립적으로 변경한다. */
function zeroRecord(): CrowdControlRecord {
  return {
    immobilizations: { status: "AVAILABLE", value: 0 },
    crowdControlSeconds: { status: "AVAILABLE", value: 0 },
    immobilizeAndKillWithAlly: { status: "AVAILABLE", value: 0 },
  };
}

it.each([
  "immobilizations",
  "crowdControlSeconds",
  "immobilizeAndKillWithAlly",
] as const)("%s의 잘못된 확보 값을 입력 오류로 전달한다", (key) => {
  // Arrange
  const input = zeroRecord();
  Reflect.set(input[key], "value", -1);

  // Act
  const result = analyzeCrowdControlStyle([input]);

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
  const empty = analyzeCrowdControlStyle([]);
  const missing = analyzeCrowdControlStyle([input]);

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
  const result = analyzeCrowdControlStyle([input]);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  const before = JSON.stringify(result.value);
  Reflect.set(input.immobilizations, "value", 1);
  analyzeCrowdControlStyle([input]);

  // Assert
  expectFrozen(result.value);
  expect(JSON.stringify(result.value)).toBe(before);
});
