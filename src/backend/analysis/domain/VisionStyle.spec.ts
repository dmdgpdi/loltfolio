import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { InvalidVisionCountError } from "./errors/InvalidVisionCountError";
import type { VisionRecord } from "./types/VisionRecord.type";
import { VisionStyle } from "./VisionStyle";

/** @description 누락된 행동을 명시적으로 미제공으로 남긴 한 경기의 시야 관측을 만든다. */
function record(overrides: Partial<VisionRecord> = {}): VisionRecord {
  return {
    controlWardsBought: { status: "NOT_PROVIDED" },
    wardsPlaced: { status: "NOT_PROVIDED" },
    wardsRemoved: { status: "NOT_PROVIDED" },
    wardTakedownsBefore20Minutes: { status: "NOT_PROVIDED" },
    ...overrides,
  };
}

it("구매와 설치를 구분하고 미구매는 실제 0에서만 센다", () => {
  // Arrange
  const records = [
    record({
      controlWardsBought: { status: "AVAILABLE", value: 0 },
      wardsPlaced: { status: "AVAILABLE", value: 12 },
    }),
    record({ controlWardsBought: { status: "AVAILABLE", value: 5 } }),
    record({ controlWardsBought: { status: "AVAILABLE", value: 2 } }),
    record({ controlWardsBought: { status: "UNKNOWN" } }),
    record(),
  ] satisfies Parameters<typeof VisionStyle.analyze>[0];

  // Act
  const result = VisionStyle.analyze(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.matchCount).toBe(5);
  expect(result.value.activities.controlWardsBought).toEqual({
    status: "AVAILABLE",
    sampleCount: 3,
    notProvidedCount: 1,
    unknownCount: 1,
    total: 7,
    average: 7 / 3,
    zeroMatchCount: 1,
  });
  expect(result.value.activities.wardsPlaced).toEqual({
    status: "AVAILABLE",
    sampleCount: 1,
    notProvidedCount: 4,
    unknownCount: 0,
    total: 12,
    average: 12,
    zeroMatchCount: 0,
  });
});

it("와드 제거와 20분 전 제거 관여는 서로 다른 관측이다", () => {
  // Arrange
  const records = [
    record({
      wardsRemoved: { status: "AVAILABLE", value: 8 },
      wardTakedownsBefore20Minutes: { status: "AVAILABLE", value: 2 },
    }),
    record({
      wardsRemoved: { status: "AVAILABLE", value: 0 },
      wardTakedownsBefore20Minutes: { status: "UNKNOWN" },
    }),
  ] satisfies Parameters<typeof VisionStyle.analyze>[0];

  // Act
  const result = VisionStyle.analyze(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.activities.wardsRemoved).toEqual({
    status: "AVAILABLE",
    sampleCount: 2,
    notProvidedCount: 0,
    unknownCount: 0,
    total: 8,
    average: 4,
    zeroMatchCount: 1,
  });
  expect(result.value.activities.wardTakedownsBefore20Minutes).toEqual({
    status: "AVAILABLE",
    sampleCount: 1,
    notProvidedCount: 0,
    unknownCount: 1,
    total: 2,
    average: 2,
    zeroMatchCount: 0,
  });
});

it("모두 0인 구매 기록도 유효한 관측이며 미제공을 미구매로 세지 않는다", () => {
  // Arrange
  const records = [
    record({ controlWardsBought: { status: "AVAILABLE", value: 0 } }),
    record(),
  ] satisfies Parameters<typeof VisionStyle.analyze>[0];

  // Act
  const result = VisionStyle.analyze(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.activities.controlWardsBought).toEqual({
    status: "AVAILABLE",
    sampleCount: 1,
    notProvidedCount: 1,
    unknownCount: 0,
    total: 0,
    average: 0,
    zeroMatchCount: 1,
  });
});

it("빈 입력은 미구매 0회가 아니라 계산 불가다", () => {
  // Arrange
  const records = [] satisfies Parameters<typeof VisionStyle.analyze>[0];

  // Act
  const result = VisionStyle.analyze(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.matchCount).toBe(0);
  expect(Object.keys(result.value.activities)).toHaveLength(4);

  for (const activity of Object.values(result.value.activities)) {
    // Assert
    expect(activity).toEqual({
      status: "UNAVAILABLE",
      sampleCount: 0,
      notProvidedCount: 0,
      unknownCount: 0,
    });
  }
});

it("유효 관측이 없으면 상태별 표본 수만 반환한다", () => {
  // Arrange
  const records = [
    record(),
    record({ controlWardsBought: { status: "UNKNOWN" } }),
  ] satisfies Parameters<typeof VisionStyle.analyze>[0];

  // Act
  const result = VisionStyle.analyze(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.activities.controlWardsBought).toEqual({
    status: "UNAVAILABLE",
    sampleCount: 0,
    notProvidedCount: 1,
    unknownCount: 1,
  });
});

it.each([
  -1,
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.MAX_SAFE_INTEGER + 1,
])("잘못된 와드 횟수를 거부한다: %s", (value) => {
  // Arrange: 각 경우의 입력을 순회한다.
  for (const kind of [
    "controlWardsBought",
    "wardsPlaced",
    "wardsRemoved",
    "wardTakedownsBefore20Minutes",
  ] as const) {
    // Arrange
    const records = [
      record({ [kind]: { status: "AVAILABLE", value } }),
    ] satisfies Parameters<typeof VisionStyle.analyze>[0];

    // Act
    const result = VisionStyle.analyze(records);

    // Assert
    expect(Result.isFailure(result)).toBe(true);

    if (Result.isSuccess(result)) {
      throw new Error("expected failure");
    }

    // Assert
    expect(result.error).toBeInstanceOf(InvalidVisionCountError);
  }
});

it("합계의 정밀도를 잃으면 실패한다", () => {
  // Arrange
  const records = [
    record({
      wardsRemoved: { status: "AVAILABLE", value: Number.MAX_SAFE_INTEGER },
    }),
    record({ wardsRemoved: { status: "AVAILABLE", value: 1 } }),
  ] satisfies Parameters<typeof VisionStyle.analyze>[0];

  // Act
  const result = VisionStyle.analyze(records);

  // Assert
  expect(Result.isFailure(result)).toBe(true);
});

it("결과는 원본 변경에 영향받지 않는 불변 값이다", () => {
  // Arrange
  const count = { status: "AVAILABLE" as const, value: 3 };
  const records = [record({ wardsPlaced: count })];

  // Act
  const result = VisionStyle.analyze(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  count.value = 99;
  records.length = 0;

  // Assert
  expect(result.value.matchCount).toBe(1);
  expect(result.value.activities.wardsPlaced).toMatchObject({ total: 3 });
  expect(Object.isFrozen(result.value)).toBe(true);
  expect(Object.isFrozen(result.value.activities)).toBe(true);
  expect(Object.values(result.value.activities).every(Object.isFrozen)).toBe(
    true,
  );
});
