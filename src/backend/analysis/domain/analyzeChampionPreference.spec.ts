import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { analyzeChampionPreference } from "./analyzeChampionPreference";
import { InvalidAnalysisPositionError } from "./errors/InvalidAnalysisPositionError";
import { InvalidChampionIdError } from "./errors/InvalidChampionIdError";
import type { AnalysisPosition } from "./types/AnalysisPosition.type";
import type { ChampionPreferenceRecord } from "./types/ChampionPreferenceRecord.type";

/** @description 챔피언과 역할을 각각 독립 관측으로 가진 선택 기록을 만든다. */
function record(
  id: number,
  position: AnalysisPosition = "MIDDLE",
): ChampionPreferenceRecord {
  return {
    championId: { status: "AVAILABLE", value: id },
    position: { status: "AVAILABLE", value: position },
  };
}

it("전체 챔피언 빈도를 보존하고 횟수 내림차순·동률 ID 오름차순으로 정렬한다", () => {
  // Arrange
  const records = [
    record(103),
    record(7),
    record(99),
    record(7),
    record(103),
    record(1),
  ];

  // Act
  const result = analyzeChampionPreference(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.matchCount).toBe(6);
  expect(result.value.champions).toEqual({
    status: "AVAILABLE",
    sampleCount: 6,
    notProvidedCount: 0,
    unknownCount: 0,
    value: [
      { value: 7, matchCount: 2 },
      { value: 103, matchCount: 2 },
      { value: 1, matchCount: 1 },
      { value: 99, matchCount: 1 },
    ],
  });
  expect(result.value.mostPlayedChampions).toEqual([7, 103]);
});

it("입력 순서를 바꿔도 챔피언·포지션 동률 결과는 동일하다", () => {
  // Arrange
  const records = [
    record(103, "BOTTOM"),
    record(7, "TOP"),
    record(1, "UTILITY"),
    record(99, "JUNGLE"),
    record(9, "MIDDLE"),
  ];

  // Act
  const forward = analyzeChampionPreference(records);
  const backward = analyzeChampionPreference([...records].reverse());

  // Assert
  expect(forward).toEqual(backward);

  if (Result.isSuccess(forward)) {
    expect(forward.value.mostPlayedChampions).toEqual([1, 7, 9, 99, 103]);
    expect(forward.value.mostPlayedPositions).toEqual([
      "TOP",
      "JUNGLE",
      "MIDDLE",
      "BOTTOM",
      "UTILITY",
    ]);
  }
});

it("역할별 빈도와 공동 최다를 반환하고 NONE은 별도 분포로만 보존한다", () => {
  // Arrange
  const records = [
    record(1, "MIDDLE"),
    record(2, "JUNGLE"),
    record(3, "JUNGLE"),
    record(4, "MIDDLE"),
    record(5, "TOP"),
    ...Array.from({ length: 5 }, () => record(6, "NONE")),
  ];

  // Act
  const result = analyzeChampionPreference(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.positionFrequencies).toEqual([
    { value: "JUNGLE", matchCount: 2 },
    { value: "MIDDLE", matchCount: 2 },
    { value: "TOP", matchCount: 1 },
  ]);
  expect(result.value.mostPlayedPositions).toEqual(["JUNGLE", "MIDDLE"]);
  expect(result.value.positions.byPosition).toEqual({
    TOP: 1,
    JUNGLE: 2,
    MIDDLE: 2,
    BOTTOM: 0,
    UTILITY: 0,
    NONE: 5,
  });
});

it("챔피언과 포지션 미확보를 서로 독립 집계한다", () => {
  // Arrange
  const records: ChampionPreferenceRecord[] = [
    record(103),
    {
      championId: { status: "NOT_PROVIDED" },
      position: { status: "AVAILABLE", value: "JUNGLE" },
    },
    { championId: { status: "UNKNOWN" }, position: { status: "NOT_PROVIDED" } },
    {
      championId: { status: "AVAILABLE", value: 103 },
      position: { status: "UNKNOWN" },
    },
  ];

  // Act
  const result = analyzeChampionPreference(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.champions).toEqual({
    status: "AVAILABLE",
    sampleCount: 2,
    notProvidedCount: 1,
    unknownCount: 1,
    value: [{ value: 103, matchCount: 2 }],
  });
  expect(result.value.positions).toMatchObject({
    matchCount: 4,
    notProvidedMatchCount: 1,
    unknownMatchCount: 1,
  });
  expect(result.value.mostPlayedPositions).toEqual(["JUNGLE", "MIDDLE"]);
});

it("빈 입력은 가상의 챔피언·최다 포지션을 만들지 않는다", () => {
  // Arrange
  const records: ChampionPreferenceRecord[] = [];

  // Act
  const result = analyzeChampionPreference(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.champions).toEqual({
    status: "UNAVAILABLE",
    sampleCount: 0,
    notProvidedCount: 0,
    unknownCount: 0,
  });
  expect(result.value.mostPlayedChampions).toEqual([]);
  expect(result.value.positionFrequencies).toEqual([]);
  expect(result.value.mostPlayedPositions).toEqual([]);
});

it("전부 미확보인 챔피언의 이유를 보존하며 NONE을 최다 역할로 만들지 않는다", () => {
  // Arrange
  const records: ChampionPreferenceRecord[] = [
    {
      championId: { status: "UNKNOWN" },
      position: { status: "AVAILABLE", value: "NONE" },
    },
    {
      championId: { status: "NOT_PROVIDED" },
      position: { status: "AVAILABLE", value: "NONE" },
    },
  ];

  // Act
  const result = analyzeChampionPreference(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.champions).toEqual({
    status: "UNAVAILABLE",
    sampleCount: 0,
    notProvidedCount: 1,
    unknownCount: 1,
  });
  expect(result.value.mostPlayedChampions).toEqual([]);
  expect(result.value.mostPlayedPositions).toEqual([]);
  expect(result.value.positions.byPosition.NONE).toBe(2);
});

it.each([
  0,
  -1,
  1.5,
  NaN,
  Infinity,
  Number.MAX_SAFE_INTEGER + 1,
  "103",
  null,
  undefined,
])("잘못된 챔피언 ID %s는 입력 오류다", (value) => {
  // Arrange
  const input = record(1);
  Reflect.set(input.championId, "value", value);

  // Act
  const result = analyzeChampionPreference([input]);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(InvalidChampionIdError)));
});

it("외부 목록 조회 없이 양의 안전 정수 ID를 보존한다", () => {
  // Arrange
  const input = record(Number.MAX_SAFE_INTEGER);

  // Act
  const result = analyzeChampionPreference([input]);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.mostPlayedChampions).toEqual([Number.MAX_SAFE_INTEGER]);
  expect(result.value.champions).toMatchObject({
    value: [{ value: Number.MAX_SAFE_INTEGER, matchCount: 1 }],
  });
});

it("잘못된 역할을 챔피언 누락 뒤로 숨기지 않는다", () => {
  // Arrange
  const input: ChampionPreferenceRecord = {
    championId: { status: "NOT_PROVIDED" },
    position: { status: "AVAILABLE", value: "TOP" },
  };
  Reflect.set(input.position, "value", "INVALID");

  // Act
  const result = analyzeChampionPreference([input]);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(InvalidAnalysisPositionError)));
});

it("중첩 목록과 항목을 동결하며 입력·다른 집계와 참조를 공유하지 않는다", () => {
  // Arrange
  const input = record(103);

  // Act
  const result = analyzeChampionPreference([input]);
  Reflect.set(input.championId, "value", 7);
  analyzeChampionPreference([input]);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.mostPlayedChampions).toEqual([103]);
  expect(Object.isFrozen(result.value)).toBe(true);
  expect(Object.isFrozen(result.value.champions)).toBe(true);
  expect(Object.isFrozen(result.value.positions.byPosition)).toBe(true);
  expect(Object.isFrozen(result.value.positionFrequencies)).toBe(true);
  expect(Object.isFrozen(result.value.positionFrequencies[0])).toBe(true);
  expect(Object.isFrozen(result.value.mostPlayedChampions)).toBe(true);
  expect(Object.isFrozen(result.value.mostPlayedPositions)).toBe(true);

  if (result.value.champions.status === "AVAILABLE") {
    expect(Object.isFrozen(result.value.champions.value)).toBe(true);
    expect(Object.isFrozen(result.value.champions.value[0])).toBe(true);
  }
});
