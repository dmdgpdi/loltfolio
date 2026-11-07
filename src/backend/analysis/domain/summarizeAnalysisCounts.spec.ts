import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { InvalidAnalysisValueError } from "./errors/InvalidAnalysisValueError";
import { summarizeAnalysisCounts } from "./summarizeAnalysisCounts";
import type { AnalysisObservation } from "./types/AnalysisObservation.type";

it("횟수의 0·발생 빈도·최다와 독립적인 표본 상태를 보존한다", () => {
  // Arrange
  const observations: AnalysisObservation<number>[] = [
    { status: "AVAILABLE", value: 0 },
    { status: "AVAILABLE", value: 3 },
    { status: "AVAILABLE", value: 2 },
    { status: "NOT_PROVIDED" },
    { status: "UNKNOWN" },
  ];

  // Act
  const result = summarizeAnalysisCounts(observations);

  // Assert
  expect(result).toEqual(
    Result.succeed({
      status: "AVAILABLE",
      sampleCount: 3,
      notProvidedCount: 1,
      unknownCount: 1,
      value: { total: 5, average: 5 / 3, maximum: 3, occurredMatchCount: 2 },
    }),
  );
});

it.each([
  NaN,
  Infinity,
  -1,
  0.5,
  Number.MAX_SAFE_INTEGER + 1,
  "많음",
  null,
])("잘못된 횟수 %s는 입력 오류다", (value) => {
  // Arrange
  const observation: AnalysisObservation<number> = {
    status: "AVAILABLE",
    value: 0,
  };
  Reflect.set(observation, "value", value);

  // Act
  const result = summarizeAnalysisCounts([observation]);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(InvalidAnalysisValueError)));
});

it("횟수 합계의 안전 정수 범위 초과를 거부한다", () => {
  // Arrange
  const observations: AnalysisObservation<number>[] = [
    { status: "AVAILABLE", value: Number.MAX_SAFE_INTEGER },
    { status: "AVAILABLE", value: 1 },
  ];

  // Act
  const result = summarizeAnalysisCounts(observations);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(InvalidAnalysisValueError)));
});

it("미제공·판별 불가만 있으면 0회 통계를 만들지 않는다", () => {
  // Arrange
  const observations: AnalysisObservation<number>[] = [
    { status: "NOT_PROVIDED" },
    { status: "UNKNOWN" },
  ];

  // Act
  const result = summarizeAnalysisCounts(observations);

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

it("안전 정수 경계의 단일 횟수는 허용한다", () => {
  // Arrange
  const observations: AnalysisObservation<number>[] = [
    { status: "AVAILABLE", value: Number.MAX_SAFE_INTEGER },
  ];

  // Act
  const result = summarizeAnalysisCounts(observations);

  // Assert
  expect(result).toMatchObject({
    value: {
      value: {
        total: Number.MAX_SAFE_INTEGER,
        maximum: Number.MAX_SAFE_INTEGER,
      },
    },
  });
});
