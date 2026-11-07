import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { InvalidFirstTowerObservationError } from "./errors/InvalidFirstTowerObservationError";
import { InvalidStructureCountError } from "./errors/InvalidStructureCountError";
import { StructureStyle } from "./StructureStyle";
import type { StructureObservation } from "./types/StructureObservation.type";
import type { StructureRecord } from "./types/StructureRecord.type";

/** @description 미확보 기록을 실제 0이나 false로 채우지 않은 한 경기의 철거 관측을 만든다. */
function record(overrides: Partial<StructureRecord> = {}): StructureRecord {
  return {
    towerTakedowns: { status: "NOT_PROVIDED" },
    towerPlates: { status: "NOT_PROVIDED" },
    inhibitorTakedowns: { status: "NOT_PROVIDED" },
    firstTowerKill: { status: "NOT_PROVIDED" },
    firstTowerAssist: { status: "NOT_PROVIDED" },
    ...overrides,
  };
}

it("포탑·방패·억제기를 각자의 표본에서 계산한다", () => {
  // Arrange
  const records = [
    record({
      towerTakedowns: { status: "AVAILABLE", value: 0 },
      towerPlates: { status: "AVAILABLE", value: 5 },
      inhibitorTakedowns: { status: "AVAILABLE", value: 2 },
    }),
    record({
      towerTakedowns: { status: "AVAILABLE", value: 3 },
      towerPlates: { status: "AVAILABLE", value: 0 },
      inhibitorTakedowns: { status: "UNKNOWN" },
    }),
    record({ towerTakedowns: { status: "AVAILABLE", value: 2 } }),
    record({ towerTakedowns: { status: "UNKNOWN" } }),
    record(),
  ] satisfies Parameters<typeof StructureStyle.analyze>[0];

  // Act
  const result = StructureStyle.analyze(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.matchCount).toBe(5);
  expect(result.value.activities.towerTakedowns).toEqual({
    status: "AVAILABLE",
    sampleCount: 3,
    notProvidedCount: 1,
    unknownCount: 1,
    total: 5,
    average: 5 / 3,
    zeroMatchCount: 1,
  });
  expect(result.value.activities.towerPlates).toEqual({
    status: "AVAILABLE",
    sampleCount: 2,
    notProvidedCount: 3,
    unknownCount: 0,
    total: 5,
    average: 2.5,
    zeroMatchCount: 1,
  });
  expect(result.value.activities.inhibitorTakedowns).toEqual({
    status: "AVAILABLE",
    sampleCount: 1,
    notProvidedCount: 3,
    unknownCount: 1,
    total: 2,
    average: 2,
    zeroMatchCount: 0,
  });
});

const flags: readonly StructureObservation<boolean>[] = [
  { status: "AVAILABLE", value: true },
  { status: "AVAILABLE", value: false },
  { status: "NOT_PROVIDED" },
  { status: "UNKNOWN" },
];
it.each(
  flags.flatMap((kill, ki) =>
    flags.map((assist, ai) => ({
      kill,
      assist,
      participated: ki === 0 || ai === 0,
      known: ki === 0 || ai === 0 || (ki === 1 && ai === 1),
    })),
  ),
)("첫 포탑 OR 판정: %j", ({ kill, assist, participated, known }) => {
  // Arrange
  const records = [
    record({ firstTowerKill: kill, firstTowerAssist: assist }),
  ] satisfies Parameters<typeof StructureStyle.analyze>[0];

  // Act
  const result = StructureStyle.analyze(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.firstTowerParticipation).toEqual(
    known
      ? {
          status: "AVAILABLE",
          sampleCount: 1,
          unresolvedMatchCount: 0,
          participatedMatchCount: participated ? 1 : 0,
          percentage: participated ? 100 : 0,
        }
      : { status: "UNAVAILABLE", sampleCount: 0, unresolvedMatchCount: 1 },
  );
});

it("직접 파괴와 도움을 중복 합산하지 않고 판정 불가를 분모에서 뺀다", () => {
  // Arrange
  const records = [
    record({ firstTowerKill: flags[0], firstTowerAssist: flags[0] }),
    record({ firstTowerKill: flags[1], firstTowerAssist: flags[1] }),
    record({ firstTowerKill: flags[1], firstTowerAssist: flags[2] }),
    record({ firstTowerKill: flags[0], firstTowerAssist: flags[3] }),
  ] satisfies Parameters<typeof StructureStyle.analyze>[0];

  // Act
  const result = StructureStyle.analyze(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.firstTowerParticipation).toEqual({
    status: "AVAILABLE",
    sampleCount: 3,
    unresolvedMatchCount: 1,
    participatedMatchCount: 2,
    percentage: (2 / 3) * 100,
  });
});

it("빈 입력은 모든 행동과 관여를 계산 불가로 반환한다", () => {
  // Arrange
  const records = [] satisfies Parameters<typeof StructureStyle.analyze>[0];

  // Act
  const result = StructureStyle.analyze(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.matchCount).toBe(0);

  for (const activity of Object.values(result.value.activities)) {
    // Assert
    expect(activity).toEqual({
      status: "UNAVAILABLE",
      sampleCount: 0,
      notProvidedCount: 0,
      unknownCount: 0,
    });
  }

  expect(result.value.firstTowerParticipation).toEqual({
    status: "UNAVAILABLE",
    sampleCount: 0,
    unresolvedMatchCount: 0,
  });
});

it("모든 유효 관측이 0이어도 계산 가능하다", () => {
  // Arrange
  const records = [
    record({ towerTakedowns: { status: "AVAILABLE", value: 0 } }),
    record(),
  ] satisfies Parameters<typeof StructureStyle.analyze>[0];

  // Act
  const result = StructureStyle.analyze(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.activities.towerTakedowns).toEqual({
    status: "AVAILABLE",
    sampleCount: 1,
    notProvidedCount: 1,
    unknownCount: 0,
    total: 0,
    average: 0,
    zeroMatchCount: 1,
  });
});

it.each([
  -1,
  0.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.MAX_SAFE_INTEGER + 1,
])("잘못된 구조물 횟수를 거부한다: %s", (value) => {
  // Arrange: 각 경우의 입력을 순회한다.
  for (const kind of [
    "towerTakedowns",
    "towerPlates",
    "inhibitorTakedowns",
  ] as const) {
    // Arrange
    const records = [
      record({ [kind]: { status: "AVAILABLE", value } }),
    ] satisfies Parameters<typeof StructureStyle.analyze>[0];

    // Act
    const result = StructureStyle.analyze(records);

    // Assert
    expect(Result.isFailure(result)).toBe(true);

    if (Result.isSuccess(result)) {
      throw new Error("expected failure");
    }

    // Assert
    expect(result.error).toBeInstanceOf(InvalidStructureCountError);
  }
});

it("합계를 안전하게 표현할 수 없으면 실패한다", () => {
  // Arrange
  const records = [
    record({
      towerPlates: { status: "AVAILABLE", value: Number.MAX_SAFE_INTEGER },
    }),
    record({ towerPlates: { status: "AVAILABLE", value: 1 } }),
  ] satisfies Parameters<typeof StructureStyle.analyze>[0];

  // Act
  const result = StructureStyle.analyze(records);

  // Assert
  expect(Result.isFailure(result)).toBe(true);
});

it("결과는 원본 변경과 분리된 불변 값이다", () => {
  // Arrange
  const count = { status: "AVAILABLE" as const, value: 3 };
  const flag = { status: "AVAILABLE" as const, value: true };
  const records = [record({ towerTakedowns: count, firstTowerKill: flag })];

  // Act
  const result = StructureStyle.analyze(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  count.value = 99;
  flag.value = false;
  records.length = 0;

  // Assert
  expect(result.value.matchCount).toBe(1);
  expect(result.value.activities.towerTakedowns).toMatchObject({ total: 3 });
  expect(result.value.firstTowerParticipation).toMatchObject({
    participatedMatchCount: 1,
  });
  expect(Object.isFrozen(result.value)).toBe(true);
  expect(Object.isFrozen(result.value.activities)).toBe(true);
  expect(Object.values(result.value.activities).every(Object.isFrozen)).toBe(
    true,
  );
  expect(Object.isFrozen(result.value.firstTowerParticipation)).toBe(true);
});

it("첫 포탑 개별 획득·어시스트와 전체 관여는 각각의 분모를 사용한다", () => {
  // Arrange
  const records = [
    record({ firstTowerKill: flags[0], firstTowerAssist: flags[0] }),
    record({ firstTowerKill: flags[1], firstTowerAssist: flags[0] }),
    record({ firstTowerKill: flags[1], firstTowerAssist: flags[1] }),
    record({ firstTowerKill: flags[2], firstTowerAssist: flags[1] }),
    record({ firstTowerKill: flags[1], firstTowerAssist: flags[3] }),
  ];

  // Act
  const result = StructureStyle.analyze(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.firstTowerKills).toEqual({
    status: "AVAILABLE",
    sampleCount: 4,
    notProvidedCount: 1,
    unknownCount: 0,
    occurredMatchCount: 1,
    percentage: 25,
  });
  expect(result.value.firstTowerAssists).toEqual({
    status: "AVAILABLE",
    sampleCount: 4,
    notProvidedCount: 0,
    unknownCount: 1,
    occurredMatchCount: 2,
    percentage: 50,
  });
  expect(result.value.firstTowerParticipation).toEqual({
    status: "AVAILABLE",
    sampleCount: 3,
    unresolvedMatchCount: 2,
    participatedMatchCount: 2,
    percentage: (2 / 3) * 100,
  });
});

it("한쪽이 true면 다른 값이 미제공이어도 전체 관여 표본에 포함한다", () => {
  // Arrange
  const records = [
    record({ firstTowerKill: flags[0], firstTowerAssist: flags[2] }),
    record({ firstTowerKill: flags[2], firstTowerAssist: flags[0] }),
    record(),
  ];

  // Act
  const result = StructureStyle.analyze(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.firstTowerKills).toMatchObject({
    sampleCount: 1,
    occurredMatchCount: 1,
    percentage: 100,
  });
  expect(result.value.firstTowerAssists).toMatchObject({
    sampleCount: 1,
    occurredMatchCount: 1,
    percentage: 100,
  });
  expect(result.value.firstTowerParticipation).toEqual({
    status: "AVAILABLE",
    sampleCount: 2,
    unresolvedMatchCount: 1,
    participatedMatchCount: 2,
    percentage: 100,
  });
});

it.each([
  { records: [], missing: 0, unknown: 0 },
  {
    records: [
      record(),
      record({ firstTowerKill: flags[3], firstTowerAssist: flags[3] }),
    ],
    missing: 1,
    unknown: 1,
  },
])("빈 입력·전부 미관측은 개별 집계에 수치를 만들지 않는다: %#", ({
  records,
  missing,
  unknown,
}) => {
  // Arrange
  const expected = {
    status: "UNAVAILABLE",
    sampleCount: 0,
    notProvidedCount: missing,
    unknownCount: unknown,
  };

  // Act
  const result = StructureStyle.analyze(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.firstTowerKills).toEqual(expected);
  expect(result.value.firstTowerAssists).toEqual(expected);
  expect(result.value.firstTowerParticipation.status).toBe("UNAVAILABLE");
});

it("실제 false는 유효 표본이며 0회·0%로 반환한다", () => {
  // Arrange
  const records = [
    record({ firstTowerKill: flags[1], firstTowerAssist: flags[1] }),
    record(),
  ];

  // Act
  const result = StructureStyle.analyze(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  const expected = {
    status: "AVAILABLE",
    sampleCount: 1,
    notProvidedCount: 1,
    unknownCount: 0,
    occurredMatchCount: 0,
    percentage: 0,
  };
  expect(result.value.firstTowerKills).toEqual(expected);
  expect(result.value.firstTowerAssists).toEqual(expected);
  expect(result.value.firstTowerParticipation).toMatchObject({
    sampleCount: 1,
    participatedMatchCount: 0,
    percentage: 0,
  });
});

it("첫 포탑의 개별 백분율을 반올림하지 않는다", () => {
  // Arrange
  const records = [
    record({ firstTowerKill: flags[0], firstTowerAssist: flags[1] }),
    record({ firstTowerKill: flags[1], firstTowerAssist: flags[0] }),
    record({ firstTowerKill: flags[1], firstTowerAssist: flags[1] }),
  ];

  // Act
  const result = StructureStyle.analyze(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.firstTowerKills).toMatchObject({
    percentage: (1 / 3) * 100,
  });
  expect(result.value.firstTowerAssists).toMatchObject({
    percentage: (1 / 3) * 100,
  });
  expect(result.value.firstTowerParticipation).toMatchObject({
    percentage: (2 / 3) * 100,
  });
});

it.each([
  "true",
  "많음",
  1,
  0,
  null,
  undefined,
])("불리언이 아닌 확보 값은 다른 값이 true여도 입력 오류다: %j", (value) => {
  // Arrange: 직접 파괴와 어시스트 입력을 각각 검증한다.
  for (const kind of ["firstTowerKill", "firstTowerAssist"] as const) {
    const records = [
      record({ firstTowerKill: flags[0], firstTowerAssist: flags[0] }),
    ];
    Reflect.set(records[0], kind, { status: "AVAILABLE", value });

    // Act
    const result = StructureStyle.analyze(records);

    // Assert
    expect(Result.isFailure(result)).toBe(true);

    if (Result.isSuccess(result)) {
      throw new Error("expected input error");
    }

    expect(result.error).toBeInstanceOf(InvalidFirstTowerObservationError);
  }
});

it("개별 집계도 원본 변경과 분리된 불변 값이다", () => {
  // Arrange
  const kill = { status: "AVAILABLE" as const, value: true };
  const assist = { status: "AVAILABLE" as const, value: false };
  const records = [record({ firstTowerKill: kill, firstTowerAssist: assist })];

  // Act
  const result = StructureStyle.analyze(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  kill.value = false;
  assist.value = true;
  records.length = 0;

  // Assert
  expect(result.value.firstTowerKills).toMatchObject({
    occurredMatchCount: 1,
    percentage: 100,
  });
  expect(result.value.firstTowerAssists).toMatchObject({
    occurredMatchCount: 0,
    percentage: 0,
  });
  expect(Object.isFrozen(result.value.firstTowerKills)).toBe(true);
  expect(Object.isFrozen(result.value.firstTowerAssists)).toBe(true);
});
