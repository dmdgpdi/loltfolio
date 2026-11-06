import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { CommunicationStyle } from "./CommunicationStyle";
import { InvalidPingCountError } from "./errors/InvalidPingCountError";
import type { CommunicationRecord } from "./types/CommunicationRecord.type";

/** @description 미관측 종류를 명시하여 한 경기의 의사소통 입력을 만든다. */
function record(
  overrides: Partial<CommunicationRecord> = {},
): CommunicationRecord {
  return {
    enemyMissing: { status: "NOT_PROVIDED" },
    danger: { status: "NOT_PROVIDED" },
    retreat: { status: "NOT_PROVIDED" },
    getBack: { status: "NOT_PROVIDED" },
    onMyWay: { status: "NOT_PROVIDED" },
    allIn: { status: "NOT_PROVIDED" },
    assistMe: { status: "NOT_PROVIDED" },
    ...overrides,
  };
}

it("종류별 평균·최다·합계는 해당 관측만 사용하고 실제 0을 포함한다", () => {
  const result = CommunicationStyle.analyze([
    record({
      enemyMissing: { status: "AVAILABLE", value: 0 },
      danger: { status: "AVAILABLE", value: 7 },
    }),
    record({ enemyMissing: { status: "AVAILABLE", value: 5 } }),
    record({ enemyMissing: { status: "AVAILABLE", value: 2 } }),
    record({ enemyMissing: { status: "UNKNOWN" } }),
    record(),
  ]);
  if (Result.isFailure(result)) {
    throw result.error;
  }

  expect(result.value.matchCount).toBe(5);
  expect(result.value.pings.enemyMissing).toEqual({
    status: "AVAILABLE",
    sampleCount: 3,
    notProvidedCount: 1,
    unknownCount: 1,
    total: 7,
    average: 7 / 3,
    maximum: 5,
  });
  expect(result.value.pings.danger).toEqual({
    status: "AVAILABLE",
    sampleCount: 1,
    notProvidedCount: 4,
    unknownCount: 0,
    total: 7,
    average: 7,
    maximum: 7,
  });
});

it("유효 관측 0개와 사용 횟수가 0인 관측을 구분한다", () => {
  const result = CommunicationStyle.analyze([
    record({
      enemyMissing: { status: "AVAILABLE", value: 0 },
      danger: { status: "UNKNOWN" },
    }),
  ]);
  if (Result.isFailure(result)) throw result.error;
  expect(result.value.pings.enemyMissing).toEqual({
    status: "AVAILABLE",
    sampleCount: 1,
    notProvidedCount: 0,
    unknownCount: 0,
    total: 0,
    average: 0,
    maximum: 0,
  });
  expect(result.value.pings.danger).toEqual({
    status: "UNAVAILABLE",
    sampleCount: 0,
    notProvidedCount: 0,
    unknownCount: 1,
  });
  expect(result.value.pings.assistMe).toEqual({
    status: "UNAVAILABLE",
    sampleCount: 0,
    notProvidedCount: 1,
    unknownCount: 0,
  });
});

it("빈 경기 목록은 모든 종류에서 계산 불가다", () => {
  const result = CommunicationStyle.analyze([]);
  if (Result.isFailure(result)) throw result.error;
  expect(result.value.matchCount).toBe(0);
  expect(Object.keys(result.value.pings)).toHaveLength(7);
  for (const usage of Object.values(result.value.pings)) {
    expect(usage).toEqual({
      status: "UNAVAILABLE",
      sampleCount: 0,
      notProvidedCount: 0,
      unknownCount: 0,
    });
  }
});

it("후퇴·getBack과 이동·총공격은 개별 사용량을 유지한다", () => {
  const result = CommunicationStyle.analyze([
    record({
      retreat: { status: "AVAILABLE", value: 2 },
      getBack: { status: "AVAILABLE", value: 3 },
      onMyWay: { status: "AVAILABLE", value: 4 },
      allIn: { status: "AVAILABLE", value: 6 },
      assistMe: { status: "AVAILABLE", value: 8 },
    }),
  ]);
  if (Result.isFailure(result)) throw result.error;
  for (const [kind, total] of [
    ["retreat", 2],
    ["getBack", 3],
    ["onMyWay", 4],
    ["allIn", 6],
    ["assistMe", 8],
  ] as const) {
    expect(result.value.pings[kind]).toMatchObject({
      status: "AVAILABLE",
      total,
      average: total,
      maximum: total,
    });
  }
});

it.each([
  -1,
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.MAX_SAFE_INTEGER + 1,
])("잘못된 횟수를 미제공으로 숨기지 않는다: %s", (value) => {
  const result = CommunicationStyle.analyze([
    record({ enemyMissing: { status: "AVAILABLE", value } }),
  ]);
  expect(Result.isFailure(result)).toBe(true);
  if (Result.isSuccess(result)) throw new Error("expected failure");
  expect(result.error).toBeInstanceOf(InvalidPingCountError);
});

it("합계의 정밀도를 잃는 입력을 거부한다", () => {
  const result = CommunicationStyle.analyze([
    record({ danger: { status: "AVAILABLE", value: Number.MAX_SAFE_INTEGER } }),
    record({ danger: { status: "AVAILABLE", value: 1 } }),
  ]);
  expect(Result.isFailure(result)).toBe(true);
});

it("원본이 변경되어도 분석 결과는 바뀌지 않는다", () => {
  const count = { status: "AVAILABLE" as const, value: 4 };
  const records = [record({ enemyMissing: count })];
  const result = CommunicationStyle.analyze(records);
  if (Result.isFailure(result)) throw result.error;
  count.value = 99;
  records.length = 0;
  expect(result.value.matchCount).toBe(1);
  expect(result.value.pings.enemyMissing).toMatchObject({ total: 4 });
  expect(Object.isFrozen(result.value)).toBe(true);
  expect(Object.isFrozen(result.value.pings)).toBe(true);
  expect(Object.values(result.value.pings).every(Object.isFrozen)).toBe(true);
});
