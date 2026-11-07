import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { InvalidAnalysisPositionError } from "./errors/InvalidAnalysisPositionError";
import { PositionDistribution } from "./PositionDistribution";
import type { AnalysisPosition } from "./types/AnalysisPosition.type";
import type { PositionRecord } from "./types/PositionRecord.type";

it("여섯 역할과 미제공·판별 불가를 구분하고 전체 경기 수를 보존한다", () => {
  // Arrange
  const positions: AnalysisPosition[] = [
    "TOP",
    "JUNGLE",
    "MIDDLE",
    "BOTTOM",
    "UTILITY",
    "NONE",
    "JUNGLE",
  ];
  const records: PositionRecord[] = positions.map((value) => ({
    position: { status: "AVAILABLE", value },
  }));
  records.push(
    { position: { status: "NOT_PROVIDED" } },
    { position: { status: "UNKNOWN" } },
  );

  // Act
  const result = PositionDistribution.analyze(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value).toEqual({
    matchCount: 9,
    byPosition: {
      TOP: 1,
      JUNGLE: 2,
      MIDDLE: 1,
      BOTTOM: 1,
      UTILITY: 1,
      NONE: 1,
    },
    notProvidedMatchCount: 1,
    unknownMatchCount: 1,
  });
  expect(
    Object.values(result.value.byPosition).reduce(
      (sum, count) => sum + count,
      0,
    ) +
      result.value.notProvidedMatchCount +
      result.value.unknownMatchCount,
  ).toBe(result.value.matchCount);
});

it("빈 입력은 모든 역할과 상태의 경기 수가 0이다", () => {
  // Arrange
  const records: PositionRecord[] = [];

  // Act
  const result = PositionDistribution.analyze(records);

  // Assert
  expect(result).toEqual(
    Result.succeed({
      matchCount: 0,
      byPosition: {
        TOP: 0,
        JUNGLE: 0,
        MIDDLE: 0,
        BOTTOM: 0,
        UTILITY: 0,
        NONE: 0,
      },
      notProvidedMatchCount: 0,
      unknownMatchCount: 0,
    }),
  );
});

it.each([
  "UNKNOWN",
  "",
  "top",
  "toString",
  "__proto__",
  1,
  null,
  undefined,
])("잘못된 확보 포지션 %s는 입력 오류다", (value) => {
  // Arrange
  const record: PositionRecord = {
    position: { status: "AVAILABLE", value: "TOP" },
  };
  Reflect.set(record.position, "value", value);

  // Act
  const result = PositionDistribution.analyze([record]);

  // Assert
  expect(Result.isFailure(result)).toBe(true);

  if (Result.isFailure(result)) {
    expect(result.error).toBeInstanceOf(InvalidAnalysisPositionError);
  }
});

it("결과를 동결하고 입력 변경과 후속 계산으로부터 분리한다", () => {
  // Arrange
  const record: PositionRecord = {
    position: { status: "AVAILABLE", value: "TOP" },
  };

  // Act
  const result = PositionDistribution.analyze([record]);
  Reflect.set(record.position, "value", "JUNGLE");
  PositionDistribution.analyze([record]);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(Object.isFrozen(result.value)).toBe(true);
  expect(Object.isFrozen(result.value.byPosition)).toBe(true);
  expect(Reflect.set(result.value.byPosition, "TOP", 9)).toBe(false);
  expect(result.value.byPosition.TOP).toBe(1);
  expect(result.value.byPosition.JUNGLE).toBe(0);
});
