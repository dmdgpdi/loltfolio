import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { averageAnalysisValues } from "./averageAnalysisValues";
import { InvalidAnalysisValueError } from "./errors/InvalidAnalysisValueError";
import type { AnalysisObservation } from "./types/AnalysisObservation.type";

it("양·시간의 소수와 실제 0을 유효 표본으로 평균한다", () => {
  // Arrange
  const observations: AnalysisObservation<number>[] = [
    { status: "AVAILABLE", value: 0 },
    { status: "AVAILABLE", value: 2.5 },
    { status: "NOT_PROVIDED" },
    { status: "UNKNOWN" },
  ];

  // Act
  const result = averageAnalysisValues(observations);

  // Assert
  expect(result).toEqual(
    Result.succeed({
      status: "AVAILABLE",
      sampleCount: 2,
      notProvidedCount: 1,
      unknownCount: 1,
      value: 1.25,
    }),
  );
});

it.each([
  NaN,
  Infinity,
  -1,
  "많음",
  null,
])("잘못된 양·시간 %s는 입력 오류다", (value) => {
  // Arrange
  const observation: AnalysisObservation<number> = {
    status: "AVAILABLE",
    value: 0,
  };
  Reflect.set(observation, "value", value);

  // Act
  const result = averageAnalysisValues([observation]);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(InvalidAnalysisValueError)));
});

it("양·시간 합계가 무한대가 되면 거부한다", () => {
  // Arrange
  const observation = { status: "AVAILABLE", value: Number.MAX_VALUE } as const;

  // Act
  const result = averageAnalysisValues([observation, observation]);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(InvalidAnalysisValueError)));
});

it("미제공·판별 불가만 있으면 평균 0을 만들지 않는다", () => {
  // Arrange
  const observations: AnalysisObservation<number>[] = [
    { status: "NOT_PROVIDED" },
    { status: "UNKNOWN" },
  ];

  // Act
  const result = averageAnalysisValues(observations);

  // Assert
  expect(result).toEqual(
    Result.succeed({
      status: "UNAVAILABLE",
      sampleCount: 0,
      notProvidedCount: 1,
      unknownCount: 1,
    }),
  );
});
