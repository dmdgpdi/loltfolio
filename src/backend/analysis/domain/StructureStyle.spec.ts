import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
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
  const result = StructureStyle.analyze([
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
  ]);
  if (Result.isFailure(result)) throw result.error;
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
  const result = StructureStyle.analyze([
    record({ firstTowerKill: kill, firstTowerAssist: assist }),
  ]);
  if (Result.isFailure(result)) throw result.error;
  expect(result.value.firstTowerParticipation).toEqual(
    known
      ? {
          status: "AVAILABLE",
          sampleCount: 1,
          unresolvedMatchCount: 0,
          participatedMatchCount: participated ? 1 : 0,
        }
      : { status: "UNAVAILABLE", sampleCount: 0, unresolvedMatchCount: 1 },
  );
});

it("직접 파괴와 도움을 중복 합산하지 않고 판정 불가를 분모에서 뺀다", () => {
  const result = StructureStyle.analyze([
    record({ firstTowerKill: flags[0], firstTowerAssist: flags[0] }),
    record({ firstTowerKill: flags[1], firstTowerAssist: flags[1] }),
    record({ firstTowerKill: flags[1], firstTowerAssist: flags[2] }),
    record({ firstTowerKill: flags[0], firstTowerAssist: flags[3] }),
  ]);
  if (Result.isFailure(result)) throw result.error;
  expect(result.value.firstTowerParticipation).toEqual({
    status: "AVAILABLE",
    sampleCount: 3,
    unresolvedMatchCount: 1,
    participatedMatchCount: 2,
  });
});

it("빈 입력은 모든 행동과 관여를 계산 불가로 반환한다", () => {
  const result = StructureStyle.analyze([]);
  if (Result.isFailure(result)) throw result.error;
  expect(result.value.matchCount).toBe(0);
  for (const activity of Object.values(result.value.activities)) {
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
  const result = StructureStyle.analyze([
    record({ towerTakedowns: { status: "AVAILABLE", value: 0 } }),
    record(),
  ]);
  if (Result.isFailure(result)) throw result.error;
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
  for (const kind of [
    "towerTakedowns",
    "towerPlates",
    "inhibitorTakedowns",
  ] as const) {
    const result = StructureStyle.analyze([
      record({ [kind]: { status: "AVAILABLE", value } }),
    ]);
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isSuccess(result)) throw new Error("expected failure");
    expect(result.error).toBeInstanceOf(InvalidStructureCountError);
  }
});

it("합계를 안전하게 표현할 수 없으면 실패한다", () => {
  const result = StructureStyle.analyze([
    record({
      towerPlates: { status: "AVAILABLE", value: Number.MAX_SAFE_INTEGER },
    }),
    record({ towerPlates: { status: "AVAILABLE", value: 1 } }),
  ]);
  expect(Result.isFailure(result)).toBe(true);
});

it("결과는 원본 변경과 분리된 불변 값이다", () => {
  const count = { status: "AVAILABLE" as const, value: 3 };
  const flag = { status: "AVAILABLE" as const, value: true };
  const records = [record({ towerTakedowns: count, firstTowerKill: flag })];
  const result = StructureStyle.analyze(records);
  if (Result.isFailure(result)) throw result.error;
  count.value = 99;
  flag.value = false;
  records.length = 0;
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
