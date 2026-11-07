import { expect, it } from "vitest";
import { FirstBloodStyle } from "./FirstBloodStyle";
import type { FirstBloodObservation } from "./types/FirstBloodObservation.type";
import type { FirstBloodRecord } from "./types/FirstBloodRecord.type";

/** @description 매개변수 테스트에서 확보된 true·false와 두 미확보 상태를 명시적으로 구성한다. */
function observation(
  value: boolean | "NOT_PROVIDED" | "UNKNOWN",
): FirstBloodObservation {
  return typeof value === "boolean"
    ? { status: "AVAILABLE", value }
    : { status: value };
}

it("직접 획득·어시스트·전체 관여는 각각의 유효 표본을 사용한다", () => {
  // Arrange
  const records: FirstBloodRecord[] = [
    { kill: observation(true), assist: observation(true) },
    { kill: observation(false), assist: observation(true) },
    { kill: observation(false), assist: observation(false) },
    { kill: observation("NOT_PROVIDED"), assist: observation(false) },
    { kill: observation(false), assist: observation("UNKNOWN") },
  ];

  // Act
  const style = FirstBloodStyle.analyze(records);

  // Assert
  expect(style.matchCount).toBe(5);
  expect(style.kills).toEqual({
    status: "AVAILABLE",
    sampleCount: 4,
    notProvidedCount: 1,
    unknownCount: 0,
    occurredMatchCount: 1,
    percentage: 25,
  });
  expect(style.assists).toEqual({
    status: "AVAILABLE",
    sampleCount: 4,
    notProvidedCount: 0,
    unknownCount: 1,
    occurredMatchCount: 2,
    percentage: 50,
  });
  expect(style.participation).toEqual({
    status: "AVAILABLE",
    sampleCount: 3,
    unresolvedMatchCount: 2,
    participatedMatchCount: 2,
    percentage: (2 / 3) * 100,
  });
});

it.each([
  [true, true, 1, 1],
  [true, false, 1, 1],
  [true, "NOT_PROVIDED", 1, 1],
  [true, "UNKNOWN", 1, 1],
  [false, true, 1, 1],
  [false, false, 1, 0],
  [false, "NOT_PROVIDED", 0, 0],
  [false, "UNKNOWN", 0, 0],
  ["NOT_PROVIDED", true, 1, 1],
  ["NOT_PROVIDED", false, 0, 0],
  ["NOT_PROVIDED", "NOT_PROVIDED", 0, 0],
  ["NOT_PROVIDED", "UNKNOWN", 0, 0],
  ["UNKNOWN", true, 1, 1],
  ["UNKNOWN", false, 0, 0],
  ["UNKNOWN", "NOT_PROVIDED", 0, 0],
  ["UNKNOWN", "UNKNOWN", 0, 0],
] as const)("첫 킬 %s·어시스트 %s의 관여를 중복 없이 판정한다", (kill, assist, sampleCount, participatedMatchCount) => {
  // Arrange
  const records: FirstBloodRecord[] = [
    { kill: observation(kill), assist: observation(assist) },
  ];

  // Act
  const style = FirstBloodStyle.analyze(records);

  // Assert
  expect(style.participation).toEqual(
    sampleCount === 0
      ? { status: "UNAVAILABLE", sampleCount: 0, unresolvedMatchCount: 1 }
      : {
          status: "AVAILABLE",
          sampleCount: 1,
          unresolvedMatchCount: 0,
          participatedMatchCount,
          percentage: participatedMatchCount * 100,
        },
  );
});

it("빈 입력은 획득·어시스트·관여를 모두 계산 불가로 남긴다", () => {
  // Arrange
  const records: FirstBloodRecord[] = [];

  // Act
  const style = FirstBloodStyle.analyze(records);

  // Assert
  expect(style.matchCount).toBe(0);
  expect(style.kills).toEqual({
    status: "UNAVAILABLE",
    sampleCount: 0,
    notProvidedCount: 0,
    unknownCount: 0,
  });
  expect(style.assists).toEqual(style.kills);
  expect(style.participation).toEqual({
    status: "UNAVAILABLE",
    sampleCount: 0,
    unresolvedMatchCount: 0,
  });
});

it("전부 false인 실제 관측은 계산 가능한 0%다", () => {
  // Arrange
  const records: FirstBloodRecord[] = [
    { kill: observation(false), assist: observation(false) },
  ];

  // Act
  const style = FirstBloodStyle.analyze(records);

  // Assert
  expect(style.kills).toEqual({
    status: "AVAILABLE",
    sampleCount: 1,
    notProvidedCount: 0,
    unknownCount: 0,
    occurredMatchCount: 0,
    percentage: 0,
  });
  expect(style.assists).toEqual(style.kills);
  expect(style.participation).toEqual({
    status: "AVAILABLE",
    sampleCount: 1,
    unresolvedMatchCount: 0,
    participatedMatchCount: 0,
    percentage: 0,
  });
});

it("개별 항목의 미제공과 판별 불가도 구분하여 보존한다", () => {
  // Arrange
  const records: FirstBloodRecord[] = [
    { kill: observation("NOT_PROVIDED"), assist: observation("UNKNOWN") },
    { kill: observation("UNKNOWN"), assist: observation("NOT_PROVIDED") },
  ];

  // Act
  const style = FirstBloodStyle.analyze(records);

  // Assert
  expect(style.kills).toEqual({
    status: "UNAVAILABLE",
    sampleCount: 0,
    notProvidedCount: 1,
    unknownCount: 1,
  });
  expect(style.assists).toEqual(style.kills);
  expect(style.participation).toEqual({
    status: "UNAVAILABLE",
    sampleCount: 0,
    unresolvedMatchCount: 2,
  });
});

it("같은 항목의 모든 표본 수 합은 입력 경기 수와 일치한다", () => {
  // Arrange
  const records: FirstBloodRecord[] = [
    { kill: observation(true), assist: observation("UNKNOWN") },
    { kill: observation(false), assist: observation("NOT_PROVIDED") },
    { kill: observation("UNKNOWN"), assist: observation(true) },
  ];

  // Act
  const style = FirstBloodStyle.analyze(records);

  // Assert
  for (const occurrence of [style.kills, style.assists]) {
    expect(
      occurrence.sampleCount +
        occurrence.notProvidedCount +
        occurrence.unknownCount,
    ).toBe(style.matchCount);
  }

  expect(
    style.participation.sampleCount + style.participation.unresolvedMatchCount,
  ).toBe(style.matchCount);
});

it("원본을 변경해도 결과는 유지되며 집계는 불변 값이다", () => {
  // Arrange
  const kill = { status: "AVAILABLE" as const, value: true };
  const assist = { status: "AVAILABLE" as const, value: false };
  const records = [{ kill, assist }];

  // Act
  const style = FirstBloodStyle.analyze(records);
  kill.value = false;
  assist.value = true;
  records.length = 0;

  // Assert
  expect(style.matchCount).toBe(1);
  expect(style.kills).toMatchObject({ occurredMatchCount: 1 });
  expect(style.assists).toMatchObject({ occurredMatchCount: 0 });
  expect(style.participation).toMatchObject({ participatedMatchCount: 1 });
  expect(Object.isFrozen(style)).toBe(true);
  expect(Object.isFrozen(style.kills)).toBe(true);
  expect(Object.isFrozen(style.assists)).toBe(true);
  expect(Object.isFrozen(style.participation)).toBe(true);
});
