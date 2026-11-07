import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { InvalidSoloKillRecordError } from "./errors/InvalidSoloKillRecordError";
import { SoloKillStyle } from "./SoloKillStyle";
import type { SoloKillRecord } from "./types/SoloKillRecord.type";

/** @description 미관측 처치를 실제 0으로 채우지 않는 한 경기의 분석 입력을 만든다. */
function record(overrides: Partial<SoloKillRecord> = {}): SoloKillRecord {
  return {
    soloKills: { status: "NOT_PROVIDED" },
    kills: { status: "NOT_PROVIDED" },
    ...overrides,
  };
}

it("솔로킬 통계와 비중의 표본을 분리한다", () => {
  // Arrange
  const records = [
    record({
      soloKills: { status: "AVAILABLE", value: 4 },
      kills: { status: "AVAILABLE", value: 4 },
    }),
    record({
      soloKills: { status: "AVAILABLE", value: 0 },
      kills: { status: "AVAILABLE", value: 16 },
    }),
    record({ soloKills: { status: "AVAILABLE", value: 5 } }),
    record({
      soloKills: { status: "UNKNOWN" },
      kills: { status: "AVAILABLE", value: 20 },
    }),
    record(),
  ] satisfies Parameters<typeof SoloKillStyle.analyze>[0];

  // Act
  const result = SoloKillStyle.analyze(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.matchCount).toBe(5);
  expect(result.value.soloKills).toEqual({
    status: "AVAILABLE",
    sampleCount: 3,
    notProvidedCount: 1,
    unknownCount: 1,
    total: 9,
    average: 3,
    maximum: 5,
    occurredMatchCount: 2,
  });
  expect(result.value.share).toEqual({
    status: "AVAILABLE",
    sampleCount: 2,
    excludedMatchCount: 3,
    soloKillTotal: 4,
    killTotal: 20,
    percentage: 20,
  });
});

it("실제 0은 유효 관측이며 킬이 있다면 솔로킬 비중도 0이다", () => {
  // Arrange
  const records = [
    record({
      soloKills: { status: "AVAILABLE", value: 0 },
      kills: { status: "AVAILABLE", value: 3 },
    }),
  ] satisfies Parameters<typeof SoloKillStyle.analyze>[0];

  // Act
  const result = SoloKillStyle.analyze(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.soloKills).toEqual({
    status: "AVAILABLE",
    sampleCount: 1,
    notProvidedCount: 0,
    unknownCount: 0,
    total: 0,
    average: 0,
    maximum: 0,
    occurredMatchCount: 0,
  });
  expect(result.value.share).toMatchObject({
    status: "AVAILABLE",
    percentage: 0,
  });
});

it("전체 킬이 0이면 솔로킬 0회는 집계하되 비중은 계산 불가다", () => {
  // Arrange
  const records = [
    record({
      soloKills: { status: "AVAILABLE", value: 0 },
      kills: { status: "AVAILABLE", value: 0 },
    }),
    record(),
  ] satisfies Parameters<typeof SoloKillStyle.analyze>[0];

  // Act
  const result = SoloKillStyle.analyze(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.soloKills).toMatchObject({
    status: "AVAILABLE",
    total: 0,
  });
  expect(result.value.share).toEqual({
    status: "UNAVAILABLE",
    reason: "NO_KILLS",
    sampleCount: 1,
    excludedMatchCount: 1,
  });
});

it("빈 입력은 모든 계산을 표본 없음으로 남긴다", () => {
  // Arrange
  const records = [] satisfies Parameters<typeof SoloKillStyle.analyze>[0];

  // Act
  const result = SoloKillStyle.analyze(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.matchCount).toBe(0);
  expect(result.value.soloKills).toEqual({
    status: "UNAVAILABLE",
    sampleCount: 0,
    notProvidedCount: 0,
    unknownCount: 0,
  });
  expect(result.value.share).toEqual({
    status: "UNAVAILABLE",
    reason: "NO_VALID_SAMPLES",
    sampleCount: 0,
    excludedMatchCount: 0,
  });
});

it("솔로킬 미제공과 판별 불가는 발생하지 않은 경기로 세지 않는다", () => {
  // Arrange
  const records = [
    record(),
    record({ soloKills: { status: "UNKNOWN" } }),
  ] satisfies Parameters<typeof SoloKillStyle.analyze>[0];

  // Act
  const result = SoloKillStyle.analyze(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.soloKills).toEqual({
    status: "UNAVAILABLE",
    sampleCount: 0,
    notProvidedCount: 1,
    unknownCount: 1,
  });
  expect(result.value.share).toEqual({
    status: "UNAVAILABLE",
    reason: "NO_VALID_SAMPLES",
    sampleCount: 0,
    excludedMatchCount: 2,
  });
});

it("전체 킬이 판별 불가여도 솔로킬 통계는 유지한다", () => {
  // Arrange
  const records = [
    record({
      soloKills: { status: "AVAILABLE", value: 2 },
      kills: { status: "UNKNOWN" },
    }),
  ] satisfies Parameters<typeof SoloKillStyle.analyze>[0];

  // Act
  const result = SoloKillStyle.analyze(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.soloKills).toMatchObject({
    status: "AVAILABLE",
    total: 2,
  });
  expect(result.value.share).toEqual({
    status: "UNAVAILABLE",
    reason: "NO_VALID_SAMPLES",
    sampleCount: 0,
    excludedMatchCount: 1,
  });
});

it("평균과 백분율을 표시용으로 반올림하지 않는다", () => {
  // Arrange
  const records = [
    record({
      soloKills: { status: "AVAILABLE", value: 1 },
      kills: { status: "AVAILABLE", value: 3 },
    }),
    record({
      soloKills: { status: "AVAILABLE", value: 0 },
      kills: { status: "AVAILABLE", value: 0 },
    }),
    record({ soloKills: { status: "AVAILABLE", value: 0 } }),
  ] satisfies Parameters<typeof SoloKillStyle.analyze>[0];

  // Act
  const result = SoloKillStyle.analyze(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.soloKills).toMatchObject({ average: 1 / 3 });
  expect(result.value.share).toMatchObject({ percentage: (1 / 3) * 100 });
});

it.each([
  -1,
  0.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.MAX_SAFE_INTEGER + 1,
])("잘못된 횟수를 비중 표본에서 제외하더라도 거부한다: %s", (value) => {
  // Arrange: 각 경우의 입력을 순회한다.
  for (const kind of ["soloKills", "kills"] as const) {
    // Arrange
    const records = [
      record({ [kind]: { status: "AVAILABLE", value } }),
    ] satisfies Parameters<typeof SoloKillStyle.analyze>[0];

    // Act
    const result = SoloKillStyle.analyze(records);

    // Assert
    expect(Result.isFailure(result)).toBe(true);

    if (Result.isSuccess(result)) {
      throw new Error("expected failure");
    }

    // Assert
    expect(result.error).toBeInstanceOf(InvalidSoloKillRecordError);
  }
});

it("솔로킬이 전체 킬보다 많으면 비중을 보정하지 않고 거부한다", () => {
  // Arrange
  const records = [
    record({
      soloKills: { status: "AVAILABLE", value: 2 },
      kills: { status: "AVAILABLE", value: 1 },
    }),
  ] satisfies Parameters<typeof SoloKillStyle.analyze>[0];

  // Act
  const result = SoloKillStyle.analyze(records);

  // Assert
  expect(Result.isFailure(result)).toBe(true);
});

it("솔로킬 합계의 정밀도를 잃으면 실패한다", () => {
  // Arrange
  const records = [
    record({
      soloKills: { status: "AVAILABLE", value: Number.MAX_SAFE_INTEGER },
    }),
    record({ soloKills: { status: "AVAILABLE", value: 1 } }),
  ] satisfies Parameters<typeof SoloKillStyle.analyze>[0];

  // Act
  const result = SoloKillStyle.analyze(records);

  // Assert
  expect(Result.isFailure(result)).toBe(true);
});

it("공통 표본의 전체 킬 합계가 안전 정수 범위를 넘으면 실패한다", () => {
  // Arrange
  const records = [
    record({
      soloKills: { status: "AVAILABLE", value: 0 },
      kills: { status: "AVAILABLE", value: Number.MAX_SAFE_INTEGER },
    }),
    record({
      soloKills: { status: "AVAILABLE", value: 0 },
      kills: { status: "AVAILABLE", value: 1 },
    }),
  ] satisfies Parameters<typeof SoloKillStyle.analyze>[0];

  // Act
  const result = SoloKillStyle.analyze(records);

  // Assert
  expect(Result.isFailure(result)).toBe(true);
});

it("원본을 변경해도 통계와 비중이 바뀌지 않는다", () => {
  // Arrange
  const solo = { status: "AVAILABLE" as const, value: 2 };
  const kills = { status: "AVAILABLE" as const, value: 4 };
  const records = [record({ soloKills: solo, kills })];

  // Act
  const result = SoloKillStyle.analyze(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  solo.value = 0;
  kills.value = 99;
  records.length = 0;

  // Assert
  expect(result.value.matchCount).toBe(1);
  expect(result.value.soloKills).toMatchObject({ total: 2 });
  expect(result.value.share).toMatchObject({ percentage: 50 });
  expect(Object.isFrozen(result.value)).toBe(true);
  expect(Object.isFrozen(result.value.soloKills)).toBe(true);
  expect(Object.isFrozen(result.value.share)).toBe(true);
});
