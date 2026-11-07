import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { analyzeLaningStyle } from "./analyzeLaningStyle";
import { InvalidAnalysisPositionError } from "./errors/InvalidAnalysisPositionError";
import { InvalidLaningRecordError } from "./errors/InvalidLaningRecordError";
import type { LaningGrowth } from "./types/LaningGrowth.type";
import type { LaningPoint } from "./types/LaningPoint.type";
import type { LaningRecord } from "./types/LaningRecord.type";

/** @description 관측 누락을 그대로 둔 랭크 라이너 기록을 구성한다. */
function record(overrides: Partial<LaningRecord> = {}): LaningRecord {
  return {
    gameRule: "SOLO_RANKED",
    position: { status: "AVAILABLE", value: "TOP" },
    earlyAdvantageIndicator: { status: "NOT_PROVIDED" },
    laningAdvantageIndicator: { status: "NOT_PROVIDED" },
    laneMinionsFirst10Minutes: { status: "NOT_PROVIDED" },
    maximumLevelLead: { status: "NOT_PROVIDED" },
    towerPlates: { status: "NOT_PROVIDED" },
    points: [],
    ...overrides,
  };
}

/** @description 성장 항목마다 서로 다른 관측 상태를 구성한다. */
function growth(overrides: Partial<LaningGrowth> = {}): LaningGrowth {
  return {
    gold: { status: "NOT_PROVIDED" },
    experience: { status: "NOT_PROVIDED" },
    level: { status: "NOT_PROVIDED" },
    laneCs: { status: "NOT_PROVIDED" },
    jungleCs: { status: "NOT_PROVIDED" },
    ...overrides,
  };
}

/** @description 실제 시각이 확보된 목표 시점의 성장 표본을 구성한다. */
function point(overrides: Partial<LaningPoint> = {}): LaningPoint {
  return {
    minute: 10,
    actualTimestampMs: { status: "AVAILABLE", value: 600000 },
    own: { status: "NOT_PROVIDED" },
    opponentDifference: { status: "UNKNOWN" },
    ...overrides,
  };
}

it("솔로·자유 랭크의 탑·미드·원딜만 표본으로 선정한다", () => {
  // Arrange
  const records = [
    record(),
    record({
      gameRule: "FLEX_RANKED",
      position: { status: "AVAILABLE", value: "MIDDLE" },
    }),
    record({ position: { status: "AVAILABLE", value: "BOTTOM" } }),
    ...(["JUNGLE", "UTILITY", "NONE"] as const).map((value) =>
      record({ position: { status: "AVAILABLE", value } }),
    ),
    record({
      gameRule: "OTHER",
      earlyAdvantageIndicator: { status: "AVAILABLE", value: NaN },
    }),
    record({ position: { status: "UNKNOWN" } }),
    record({ position: { status: "NOT_PROVIDED" } }),
  ];

  // Act
  const result = analyzeLaningStyle(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.matchCount).toBe(9);
  expect(result.value.laningMatchCount).toBe(3);
  expect(result.value.earlyAdvantage).toEqual({
    status: "UNAVAILABLE",
    sampleCount: 0,
    notProvidedCount: 3,
    unknownCount: 0,
  });
});

it("우위는 1·0만 판별하고 다른 정상 숫자는 UNKNOWN으로 보존한다", () => {
  // Arrange
  const records = [1, 0, 1, 2, -1, 0.5].map((value) =>
    record({ earlyAdvantageIndicator: { status: "AVAILABLE", value } }),
  );
  records.push(
    record(),
    record({ earlyAdvantageIndicator: { status: "UNKNOWN" } }),
  );

  // Act
  const result = analyzeLaningStyle(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.earlyAdvantage).toEqual({
    status: "AVAILABLE",
    sampleCount: 3,
    notProvidedCount: 1,
    unknownCount: 4,
    value: { matchedMatchCount: 2, percentage: (2 / 3) * 100 },
  });
  expect(result.value.laningAdvantage).toMatchObject({
    status: "UNAVAILABLE",
    notProvidedCount: 8,
  });
});

/** @description 지표와 시점마다 서로 다른 표본을 가진 세 경기의 기록이다. */
function growthRecords(): LaningRecord[] {
  return [
    record({
      laneMinionsFirst10Minutes: { status: "AVAILABLE", value: 80 },
      maximumLevelLead: { status: "AVAILABLE", value: 2 },
      towerPlates: { status: "AVAILABLE", value: 0 },
      points: [
        point({
          own: {
            status: "AVAILABLE",
            value: growth({
              gold: { status: "AVAILABLE", value: 4000 },
              laneCs: { status: "AVAILABLE", value: 70 },
            }),
          },
          opponentDifference: {
            status: "AVAILABLE",
            value: growth({ gold: { status: "AVAILABLE", value: -200 } }),
          },
        }),
        point({
          minute: 15,
          actualTimestampMs: { status: "AVAILABLE", value: 900001 },
          opponentDifference: {
            status: "AVAILABLE",
            value: growth({ laneCs: { status: "AVAILABLE", value: -10 } }),
          },
        }),
      ],
    }),
    record({
      points: [
        point({
          own: {
            status: "AVAILABLE",
            value: growth({
              gold: { status: "AVAILABLE", value: 5000 },
              experience: { status: "UNKNOWN" },
            }),
          },
        }),
      ],
    }),
    record(),
  ];
}

it("본인 수치와 상대 격차 및 10·15분 표본을 각각 집계한다", () => {
  // Arrange
  const records = growthRecords();

  // Act
  const result = analyzeLaningStyle(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.tenMinutes.own.gold).toEqual({
    status: "AVAILABLE",
    sampleCount: 2,
    notProvidedCount: 1,
    unknownCount: 0,
    value: 4500,
  });
  expect(result.value.tenMinutes.opponentDifference.gold).toEqual({
    status: "AVAILABLE",
    sampleCount: 1,
    notProvidedCount: 1,
    unknownCount: 1,
    value: -200,
  });
  expect(result.value.fifteenMinutes.opponentDifference.laneCs).toMatchObject({
    value: -10,
    sampleCount: 1,
    notProvidedCount: 2,
  });
  expect(result.value.tenMinutes.own.experience).toMatchObject({
    status: "UNAVAILABLE",
    unknownCount: 1,
    notProvidedCount: 2,
  });
  expect(result.value.averageLaneMinionsFirst10Minutes).toMatchObject({
    value: 80,
  });
  expect(result.value.tenMinutes.own.laneCs).toMatchObject({ value: 70 });
  expect(result.value.averageMaximumLevelLead).toMatchObject({ value: 2 });
  expect(result.value.averageTowerPlates).toMatchObject({
    value: 0,
    sampleCount: 1,
  });
});

it("부모 관측 UNKNOWN과 NOT_PROVIDED를 모든 성장 항목에 전파한다", () => {
  // Arrange
  const records = [
    record({ points: [point({ own: { status: "UNKNOWN" } })] }),
    record(),
  ];

  // Act
  const result = analyzeLaningStyle(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  for (const metric of Object.values(result.value.tenMinutes.own)) {
    expect(metric).toEqual({
      status: "UNAVAILABLE",
      sampleCount: 0,
      notProvidedCount: 1,
      unknownCount: 1,
    });
  }
});

it("빈 입력은 모든 지표를 숫자 없이 반환한다", () => {
  // Arrange
  const records: LaningRecord[] = [];

  // Act
  const result = analyzeLaningStyle(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.laningMatchCount).toBe(0);
  expect(result.value.earlyAdvantage).toEqual({
    status: "UNAVAILABLE",
    sampleCount: 0,
    notProvidedCount: 0,
    unknownCount: 0,
  });
  expect(result.value.tenMinutes.own.gold).not.toHaveProperty("value");
});

it.each([
  "earlyAdvantageIndicator",
  "laningAdvantageIndicator",
  "laneMinionsFirst10Minutes",
  "maximumLevelLead",
  "towerPlates",
] as const)("%s의 잘못된 숫자는 입력 오류다", (key) => {
  // Arrange
  const input = record({ [key]: { status: "AVAILABLE", value: NaN } });

  // Act
  const result = analyzeLaningStyle([input]);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(InvalidLaningRecordError)));
});

it.each([
  "많음",
  Infinity,
  null,
])("잘못된 우위 원값 %s를 숨기지 않는다", (value) => {
  // Arrange
  const input = record({
    earlyAdvantageIndicator: { status: "AVAILABLE", value: 0 },
  });
  Reflect.set(input.earlyAdvantageIndicator, "value", value);

  // Act
  const result = analyzeLaningStyle([input]);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(InvalidLaningRecordError)));
});

it.each([
  -1,
  1.5,
  Number.MAX_SAFE_INTEGER + 1,
])("본인 성장의 잘못된 값 %s를 거부한다", (value) => {
  // Arrange
  const input = record({
    points: [
      point({
        own: {
          status: "AVAILABLE",
          value: growth({ gold: { status: "AVAILABLE", value } }),
        },
      }),
    ],
  });

  // Act
  const result = analyzeLaningStyle([input]);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(InvalidLaningRecordError)));
});

it.each([595000, 605000])("5초 경계 시각 %s는 허용한다", (value) => {
  // Arrange
  const input = record({
    points: [point({ actualTimestampMs: { status: "AVAILABLE", value } })],
  });

  // Act
  const result = analyzeLaningStyle([input]);

  // Assert
  expect(Result.isSuccess(result)).toBe(true);
});

it.each([
  594999,
  605001,
  NaN,
  -1,
  600000.5,
])("잘못된 실제 시각 %s는 입력 오류다", (value) => {
  // Arrange
  const input = record({
    points: [point({ actualTimestampMs: { status: "AVAILABLE", value } })],
  });

  // Act
  const result = analyzeLaningStyle([input]);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(InvalidLaningRecordError)));
});

it("중복 시점은 한 경기를 두 번 세지 않고 입력 오류로 반환한다", () => {
  // Arrange
  const input = record({ points: [point(), point()] });

  // Act
  const result = analyzeLaningStyle([input]);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(InvalidLaningRecordError)));
});

it("허용하지 않은 목표 시점은 입력 오류다", () => {
  // Arrange
  const input = point();
  Reflect.set(input, "minute", 7);

  // Act
  const result = analyzeLaningStyle([record({ points: [input] })]);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(InvalidLaningRecordError)));
});

it("잘못된 게임 규칙과 포지션은 입력 오류다", () => {
  // Arrange
  const invalidRule = record();
  const invalidPosition = record();
  Reflect.set(invalidRule, "gameRule", "INVALID");
  Reflect.set(invalidPosition.position, "value", "INVALID");

  // Act
  const ruleResult = analyzeLaningStyle([invalidRule]);
  const positionResult = analyzeLaningStyle([invalidPosition]);

  // Assert
  expect(ruleResult).toEqual(Result.fail(expect.any(InvalidLaningRecordError)));
  expect(positionResult).toEqual(
    Result.fail(expect.any(InvalidAnalysisPositionError)),
  );
});

it("평균의 합계 범위 초과를 거부한다", () => {
  // Arrange
  const input = record({
    laneMinionsFirst10Minutes: { status: "AVAILABLE", value: Number.MAX_VALUE },
  });

  // Act
  const result = analyzeLaningStyle([input, input]);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(InvalidLaningRecordError)));
});

it("중첩 결과를 동결하고 입력 변경과 후속 집계로부터 분리한다", () => {
  // Arrange
  const own = growth({ gold: { status: "AVAILABLE", value: 4000 } });
  const input = record({
    earlyAdvantageIndicator: { status: "AVAILABLE", value: 1 },
    points: [point({ own: { status: "AVAILABLE", value: own } })],
  });

  // Act
  const result = analyzeLaningStyle([input]);
  Reflect.set(own.gold, "value", 9999);
  analyzeLaningStyle([input]);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.tenMinutes.own.gold).toMatchObject({ value: 4000 });
  expect(Object.isFrozen(result.value)).toBe(true);
  expect(Object.isFrozen(result.value.tenMinutes)).toBe(true);
  expect(Object.isFrozen(result.value.tenMinutes.own)).toBe(true);
  expect(Object.isFrozen(result.value.tenMinutes.own.gold)).toBe(true);

  if (result.value.earlyAdvantage.status === "AVAILABLE") {
    expect(Object.isFrozen(result.value.earlyAdvantage.value)).toBe(true);
  }
});

it.each([
  "gold",
  "experience",
  "level",
  "laneCs",
  "jungleCs",
] as const)("상대 %s의 음수·0·양수를 유효 표본으로 평균한다", (key) => {
  // Arrange
  const records = [-3, 0, 6].map((value) =>
    record({
      points: [
        point({
          opponentDifference: {
            status: "AVAILABLE",
            value: growth({ [key]: { status: "AVAILABLE", value } }),
          },
        }),
      ],
    }),
  );

  // Act
  const result = analyzeLaningStyle(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.tenMinutes.opponentDifference[key]).toEqual({
    status: "AVAILABLE",
    sampleCount: 3,
    notProvidedCount: 0,
    unknownCount: 0,
    value: 1,
  });
});

it("라인전 우위는 초반 우위와 다른 분모로 계산한다", () => {
  // Arrange
  const records = [
    record({ laningAdvantageIndicator: { status: "AVAILABLE", value: 0 } }),
    record({ laningAdvantageIndicator: { status: "AVAILABLE", value: 2 } }),
    record({ laningAdvantageIndicator: { status: "UNKNOWN" } }),
  ];

  // Act
  const result = analyzeLaningStyle(records);

  if (Result.isFailure(result)) {
    throw result.error;
  }

  // Assert
  expect(result.value.laningAdvantage).toEqual({
    status: "AVAILABLE",
    sampleCount: 1,
    notProvidedCount: 0,
    unknownCount: 2,
    value: { matchedMatchCount: 0, percentage: 0 },
  });
  expect(result.value.earlyAdvantage).toMatchObject({
    status: "UNAVAILABLE",
    notProvidedCount: 3,
  });
});

it.each([
  NaN,
  Infinity,
  0.5,
  Number.MIN_SAFE_INTEGER - 1,
])("상대 격차의 잘못된 숫자 %s를 거부한다", (value) => {
  // Arrange
  const input = record({
    points: [
      point({
        opponentDifference: {
          status: "AVAILABLE",
          value: growth({ gold: { status: "AVAILABLE", value } }),
        },
      }),
    ],
  });

  // Act
  const result = analyzeLaningStyle([input]);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(InvalidLaningRecordError)));
});

it("안전 정수 성장의 합계 범위 초과도 거부한다", () => {
  // Arrange
  const input = record({
    points: [
      point({
        own: {
          status: "AVAILABLE",
          value: growth({
            gold: { status: "AVAILABLE", value: Number.MAX_SAFE_INTEGER },
          }),
        },
      }),
    ],
  });

  // Act
  const result = analyzeLaningStyle([input, input]);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(InvalidLaningRecordError)));
});
