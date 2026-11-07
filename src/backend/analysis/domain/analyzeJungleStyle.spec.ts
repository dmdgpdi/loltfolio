import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { analyzeJungleStyle } from "./analyzeJungleStyle";
import { InvalidAnalysisPositionError } from "./errors/InvalidAnalysisPositionError";
import { InvalidJungleValueError } from "./errors/InvalidJungleValueError";
import type { JungleRecord } from "./types/JungleRecord.type";

/** @description 미제공 활동을 실제 0으로 바꾸지 않는 정글 관측을 만든다. */
function record(overrides: Partial<JungleRecord> = {}): JungleRecord {
  return {
    position: { status: "AVAILABLE", value: "JUNGLE" },
    enemyJungleMonsterKills: { status: "NOT_PROVIDED" },
    enemyJungleMinionsKilled: { status: "NOT_PROVIDED" },
    scuttleCrabKills: { status: "NOT_PROVIDED" },
    earlyLanerKills: { status: "NOT_PROVIDED" },
    dragonTakedowns: { status: "NOT_PROVIDED" },
    baronTakedowns: { status: "NOT_PROVIDED" },
    buffsStolen: { status: "NOT_PROVIDED" },
    ...overrides,
  };
}

it("정글만 선정하고 지표별 유효·미제공·판별 불가 표본을 보존한다", () => {
  // Arrange
  const records = [
    record({ scuttleCrabKills: { status: "AVAILABLE", value: 4 } }),
    record({ scuttleCrabKills: { status: "AVAILABLE", value: 0 } }),
    record({ scuttleCrabKills: { status: "UNKNOWN" } }),
    record(),
    ...(["TOP", "MIDDLE", "BOTTOM", "UTILITY", "NONE"] as const).map((value) =>
      record({
        position: { status: "AVAILABLE", value },
        scuttleCrabKills: { status: "AVAILABLE", value: -1 },
      }),
    ),
    record({ position: { status: "UNKNOWN" } }),
    record({ position: { status: "NOT_PROVIDED" } }),
  ];

  // Act
  const result = analyzeJungleStyle(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.matchCount).toBe(11);
  expect(result.value.jungleMatchCount).toBe(4);
  expect(result.value.scuttleCrabKills).toEqual({
    status: "AVAILABLE",
    sampleCount: 2,
    notProvidedCount: 1,
    unknownCount: 1,
    value: { total: 4, average: 2, maximum: 4, occurredMatchCount: 1 },
  });
  expect(result.value.baronTakedowns).toEqual({
    status: "UNAVAILABLE",
    sampleCount: 0,
    notProvidedCount: 4,
    unknownCount: 0,
  });
});

it("적 정글 두 원천을 구분하고 모든 활동을 독립 집계한다", () => {
  // Arrange
  const input = record({
    enemyJungleMonsterKills: { status: "AVAILABLE", value: 1.5 },
    enemyJungleMinionsKilled: { status: "AVAILABLE", value: 8 },
    scuttleCrabKills: { status: "AVAILABLE", value: 1 },
    earlyLanerKills: { status: "AVAILABLE", value: 2 },
    dragonTakedowns: { status: "AVAILABLE", value: 3 },
    baronTakedowns: { status: "AVAILABLE", value: 4 },
    buffsStolen: { status: "AVAILABLE", value: 5 },
  });

  // Act
  const result = analyzeJungleStyle([input]);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.averageEnemyJungleMonsterKills).toEqual({
    status: "AVAILABLE",
    sampleCount: 1,
    notProvidedCount: 0,
    unknownCount: 0,
    value: 1.5,
  });

  for (const [key, total] of [
    ["enemyJungleMinionsKilled", 8],
    ["scuttleCrabKills", 1],
    ["earlyLanerKills", 2],
    ["dragonTakedowns", 3],
    ["baronTakedowns", 4],
    ["buffsStolen", 5],
  ] as const) {
    expect(result.value[key]).toEqual({
      status: "AVAILABLE",
      sampleCount: 1,
      notProvidedCount: 0,
      unknownCount: 0,
      value: { total, average: total, maximum: total, occurredMatchCount: 1 },
    });
  }
});

it.each([
  { records: [] },
  { records: [record({ position: { status: "AVAILABLE", value: "NONE" } })] },
])("정글 0경기는 가상의 수치를 제공하지 않는다", ({ records }) => {
  // Arrange
  const input = records;

  // Act
  const result = analyzeJungleStyle(input);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.jungleMatchCount).toBe(0);
  expect(result.value.averageEnemyJungleMonsterKills).toEqual({
    status: "UNAVAILABLE",
    sampleCount: 0,
    notProvidedCount: 0,
    unknownCount: 0,
  });
  expect(result.value.buffsStolen).not.toHaveProperty("value");
});

it.each([
  -1,
  NaN,
  Infinity,
  "많음",
  null,
  1.5,
  Number.MAX_SAFE_INTEGER + 1,
])("잘못된 횟수 %s는 입력 오류다", (value) => {
  // Arrange
  const input = record({ buffsStolen: { status: "AVAILABLE", value: 1 } });
  Reflect.set(input.buffsStolen, "value", value);

  // Act
  const result = analyzeJungleStyle([input]);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(InvalidJungleValueError)));
});

it.each([
  -1,
  NaN,
  Infinity,
  "많음",
  null,
])("잘못된 몬스터 원값 %s는 입력 오류다", (value) => {
  // Arrange
  const input = record({
    enemyJungleMonsterKills: { status: "AVAILABLE", value: 0 },
  });
  Reflect.set(input.enemyJungleMonsterKills, "value", value);

  // Act
  const result = analyzeJungleStyle([input]);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(InvalidJungleValueError)));
});

it("잘못된 역할은 정글 외 경기로 숨기지 않는다", () => {
  // Arrange
  const input = record();
  Reflect.set(input.position, "value", "INVALID");

  // Act
  const result = analyzeJungleStyle([input]);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(InvalidAnalysisPositionError)));
});

it.each([
  "buffsStolen",
  "enemyJungleMonsterKills",
] as const)("%s 합계의 범위 초과를 거부한다", (key) => {
  // Arrange
  const value =
    key === "buffsStolen" ? Number.MAX_SAFE_INTEGER : Number.MAX_VALUE;
  const input = record({ [key]: { status: "AVAILABLE", value } });

  // Act
  const result = analyzeJungleStyle([input, input]);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(InvalidJungleValueError)));
});

it("결과 전체를 동결하고 원본 변경과 계산 간 참조를 분리한다", () => {
  // Arrange
  const input = record({ buffsStolen: { status: "AVAILABLE", value: 2 } });

  // Act
  const result = analyzeJungleStyle([input]);
  Reflect.set(input.buffsStolen, "value", 9);
  analyzeJungleStyle([input]);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(Object.isFrozen(result.value)).toBe(true);
  expect(Object.isFrozen(result.value.buffsStolen)).toBe(true);
  expect(result.value.buffsStolen).toMatchObject({ value: { total: 2 } });

  if (result.value.buffsStolen.status === "AVAILABLE") {
    expect(Object.isFrozen(result.value.buffsStolen.value)).toBe(true);
  }
});
