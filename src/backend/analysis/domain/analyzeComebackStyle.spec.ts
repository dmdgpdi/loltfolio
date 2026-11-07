import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { analyzeComebackStyle } from "./analyzeComebackStyle";
import { InvalidAnalysisPositionError } from "./errors/InvalidAnalysisPositionError";
import { InvalidComebackRecordError } from "./errors/InvalidComebackRecordError";
import type { ComebackRecord } from "./types/ComebackRecord.type";

/** @description 관측 누락을 임의 보정하지 않은 동일 역할 상대 비교 기록이다. */
function record(overrides: Partial<ComebackRecord> = {}): ComebackRecord {
  return {
    position: { status: "AVAILABLE", value: "TOP" },
    goldDifferenceAt15Minutes: { status: "NOT_PROVIDED" },
    win: { status: "NOT_PROVIDED" },
    ...overrides,
  };
}

/** @description 골드 격차와 승패가 모두 확보된 기록을 만든다. */
function known(gold: number, win: boolean): ComebackRecord {
  return record({
    goldDifferenceAt15Minutes: { status: "AVAILABLE", value: gold },
    win: { status: "AVAILABLE", value: win },
  });
}

it("음수 격차만 열세로 세고 승패가 확보된 열세에서 승률을 계산한다", () => {
  // Arrange
  const records = [
    known(-100, true),
    known(-900, true),
    known(-1, false),
    known(0, true),
    known(500, false),
  ];

  // Act
  const result = analyzeComebackStyle(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.matchCount).toBe(5);
  expect(result.value.deficitMatchCount).toBe(3);
  expect(result.value.deficitWinRate).toEqual({
    status: "AVAILABLE",
    sampleCount: 3,
    notProvidedCount: 0,
    unknownCount: 0,
    value: { matchedMatchCount: 2, percentage: (2 / 3) * 100 },
  });
  expect(result.value.largestDeficitInWins).toEqual({
    status: "AVAILABLE",
    sampleCount: 2,
    notProvidedCount: 0,
    unknownCount: 0,
    value: 900,
  });
  expect(result.value.averageGoldDifferenceInWins).toEqual({
    status: "AVAILABLE",
    sampleCount: 2,
    notProvidedCount: 0,
    unknownCount: 0,
    value: -500,
  });
});

it("승패를 모르는 열세도 경기 수에 포함하고 승률의 분모에서는 제외한다", () => {
  // Arrange
  const records = [
    known(-1, true),
    record({ goldDifferenceAt15Minutes: { status: "AVAILABLE", value: -20 } }),
    record({
      goldDifferenceAt15Minutes: { status: "AVAILABLE", value: -30 },
      win: { status: "UNKNOWN" },
    }),
  ];

  // Act
  const result = analyzeComebackStyle(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.deficitMatchCount).toBe(3);
  expect(result.value.deficitWinRate).toEqual({
    status: "AVAILABLE",
    sampleCount: 1,
    notProvidedCount: 1,
    unknownCount: 1,
    value: { matchedMatchCount: 1, percentage: 100 },
  });
  expect(result.value.largestDeficitInWins).toEqual({
    status: "AVAILABLE",
    sampleCount: 1,
    notProvidedCount: 1,
    unknownCount: 1,
    value: 1,
  });
});

it("골드 미확보 이유를 보존하며 패배 확정 시 승리 열세 통계에는 요구하지 않는다", () => {
  // Arrange
  const records = [
    record({ win: { status: "AVAILABLE", value: true } }),
    record({
      goldDifferenceAt15Minutes: { status: "UNKNOWN" },
      win: { status: "AVAILABLE", value: true },
    }),
    record({
      goldDifferenceAt15Minutes: { status: "UNKNOWN" },
      win: { status: "AVAILABLE", value: false },
    }),
  ];

  // Act
  const result = analyzeComebackStyle(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.deficitWinRate).toEqual({
    status: "UNAVAILABLE",
    sampleCount: 0,
    notProvidedCount: 1,
    unknownCount: 2,
  });
  expect(result.value.averageGoldDifferenceInWins).toEqual({
    status: "UNAVAILABLE",
    sampleCount: 0,
    notProvidedCount: 1,
    unknownCount: 1,
  });
});

it("비열세가 확정되면 승패 누락과 관계없이 조건 비충족이다", () => {
  // Arrange
  const records = [
    record({ goldDifferenceAt15Minutes: { status: "AVAILABLE", value: 0 } }),
    record({
      goldDifferenceAt15Minutes: { status: "AVAILABLE", value: 1 },
      win: { status: "UNKNOWN" },
    }),
  ];

  // Act
  const result = analyzeComebackStyle(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.deficitMatchCount).toBe(0);
  expect(result.value.deficitWinRate).toEqual({
    status: "UNAVAILABLE",
    sampleCount: 0,
    notProvidedCount: 0,
    unknownCount: 0,
  });
  expect(result.value.largestDeficitInWins).toEqual({
    status: "UNAVAILABLE",
    sampleCount: 0,
    notProvidedCount: 0,
    unknownCount: 0,
  });
});

it("다섯 역할을 모두 사용하며 NONE·미제공·판별 불가 역할은 제외한다", () => {
  // Arrange
  const records = (
    ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const
  ).map(
    (value) =>
      ({
        ...known(-1, true),
        position: { status: "AVAILABLE", value },
      }) satisfies ComebackRecord,
  );
  const input: ComebackRecord[] = [
    ...records,
    record({ position: { status: "AVAILABLE", value: "NONE" } }),
    record({ position: { status: "NOT_PROVIDED" } }),
    record({ position: { status: "UNKNOWN" } }),
  ];

  // Act
  const result = analyzeComebackStyle(input);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.matchCount).toBe(8);
  expect(result.value.deficitMatchCount).toBe(5);
  expect(result.value.deficitWinRate).toMatchObject({
    sampleCount: 5,
    notProvidedCount: 0,
    unknownCount: 0,
  });
});

it("열세 후 승리가 없으면 0% 승률과 계산 불가 열세 크기를 구분한다", () => {
  // Arrange
  const records = [known(-100, false)];

  // Act
  const result = analyzeComebackStyle(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.deficitWinRate).toMatchObject({
    status: "AVAILABLE",
    value: { matchedMatchCount: 0, percentage: 0 },
  });
  expect(result.value.largestDeficitInWins).toEqual({
    status: "UNAVAILABLE",
    sampleCount: 0,
    notProvidedCount: 0,
    unknownCount: 0,
  });
  expect(result.value.averageGoldDifferenceInWins).not.toHaveProperty("value");
});

it("빈 입력은 숫자를 만들지 않는다", () => {
  // Arrange
  const records: ComebackRecord[] = [];

  // Act
  const result = analyzeComebackStyle(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.matchCount).toBe(0);
  expect(result.value.deficitWinRate).toEqual({
    status: "UNAVAILABLE",
    sampleCount: 0,
    notProvidedCount: 0,
    unknownCount: 0,
  });
  expect(result.value.largestDeficitInWins).not.toHaveProperty("value");
});

it.each([
  NaN,
  Infinity,
  -Infinity,
  0.5,
  Number.MAX_SAFE_INTEGER + 1,
  "많음",
  null,
])("잘못된 골드 격차 %s는 승패와 무관하게 입력 오류다", (value) => {
  // Arrange
  const input = known(0, false);
  Reflect.set(input.goldDifferenceAt15Minutes, "value", value);

  // Act
  const result = analyzeComebackStyle([input]);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(InvalidComebackRecordError)));
});

it.each([
  "true",
  0,
  1,
  null,
  undefined,
])("잘못된 승패 %s는 비열세라도 입력 오류다", (value) => {
  // Arrange
  const input = known(0, false);
  Reflect.set(input.win, "value", value);

  // Act
  const result = analyzeComebackStyle([input]);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(InvalidComebackRecordError)));
});

it("잘못된 역할을 제외 경기로 숨기지 않는다", () => {
  // Arrange
  const input = known(-1, true);
  Reflect.set(input.position, "value", "INVALID");

  // Act
  const result = analyzeComebackStyle([input]);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(InvalidAnalysisPositionError)));
});

it("승리 열세 합계의 정수 범위 초과를 거부한다", () => {
  // Arrange
  const records = [known(Number.MIN_SAFE_INTEGER, true), known(-1, true)];

  // Act
  const result = analyzeComebackStyle(records);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(InvalidComebackRecordError)));
});

it("안전 정수 경계의 열세 크기는 정확히 보존한다", () => {
  // Arrange
  const records = [known(Number.MIN_SAFE_INTEGER, true)];

  // Act
  const result = analyzeComebackStyle(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.largestDeficitInWins).toMatchObject({
    value: Number.MAX_SAFE_INTEGER,
  });
  expect(result.value.averageGoldDifferenceInWins).toMatchObject({
    value: Number.MIN_SAFE_INTEGER,
  });
});

it("결과와 중첩 통계를 동결하며 원본 변경과 집계 간 참조를 분리한다", () => {
  // Arrange
  const input = known(-10, true);

  // Act
  const result = analyzeComebackStyle([input]);
  Reflect.set(input.goldDifferenceAt15Minutes, "value", -999);
  analyzeComebackStyle([input]);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.averageGoldDifferenceInWins).toMatchObject({
    value: -10,
  });
  expect(Object.isFrozen(result.value)).toBe(true);
  expect(Object.isFrozen(result.value.deficitWinRate)).toBe(true);
  expect(Object.isFrozen(result.value.largestDeficitInWins)).toBe(true);
  expect(Object.isFrozen(result.value.averageGoldDifferenceInWins)).toBe(true);

  if (result.value.deficitWinRate.status === "AVAILABLE") {
    expect(Object.isFrozen(result.value.deficitWinRate.value)).toBe(true);
  }
});

it("승리 열세 판별에 미제공과 판별 불가가 섞이면 UNKNOWN으로 한 번만 센다", () => {
  // Arrange
  const records = [
    record({ win: { status: "UNKNOWN" } }),
    record({ goldDifferenceAt15Minutes: { status: "UNKNOWN" } }),
  ];

  // Act
  const result = analyzeComebackStyle(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.largestDeficitInWins).toEqual({
    status: "UNAVAILABLE",
    sampleCount: 0,
    notProvidedCount: 0,
    unknownCount: 2,
  });
  expect(result.value.deficitWinRate).toEqual({
    status: "UNAVAILABLE",
    sampleCount: 0,
    notProvidedCount: 1,
    unknownCount: 1,
  });
});

it("승패가 모두 미확보인 열세는 승률과 열세 크기를 만들지 않는다", () => {
  // Arrange
  const records = [
    record({ goldDifferenceAt15Minutes: { status: "AVAILABLE", value: -1 } }),
  ];

  // Act
  const result = analyzeComebackStyle(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.deficitMatchCount).toBe(1);
  expect(result.value.deficitWinRate).toEqual({
    status: "UNAVAILABLE",
    sampleCount: 0,
    notProvidedCount: 1,
    unknownCount: 0,
  });
  expect(result.value.averageGoldDifferenceInWins).toEqual({
    status: "UNAVAILABLE",
    sampleCount: 0,
    notProvidedCount: 1,
    unknownCount: 0,
  });
});

it("역할 미확보 경기는 해당 활동의 검증·집계 표본에 섞지 않는다", () => {
  // Arrange
  const records = [
    record({
      position: { status: "UNKNOWN" },
      goldDifferenceAt15Minutes: { status: "AVAILABLE", value: NaN },
    }),
  ];

  // Act
  const result = analyzeComebackStyle(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.matchCount).toBe(1);
  expect(result.value.deficitWinRate).toEqual({
    status: "UNAVAILABLE",
    sampleCount: 0,
    notProvidedCount: 0,
    unknownCount: 0,
  });
});
