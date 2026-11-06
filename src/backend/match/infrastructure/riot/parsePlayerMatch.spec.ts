import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { emptyPlayerMatchStats } from "../../domain/emptyPlayerMatchStats";
import { createRiotMatchResponse as matchResponse } from "../../testing/createRiotMatchResponse";
import { createRiotTimelineResponse as timelineResponse } from "../../testing/createRiotTimelineResponse";
import { parsePlayerMatch } from "./parsePlayerMatch";

const infoFields = [
  ["gameId", "gameId"],
  ["gameMode", "gameMode"],
  ["mapId", "mapId"],
  ["gameVersion", "gameVersion"],
  ["gameStartTimestamp", "startedAt"],
  ["gameDuration", "durationSeconds"],
  ["endOfGameResult", "endOfGameResult"],
] as const;
const participantFields = [
  ["championName", "champion"],
  ["teamPosition", "position"],
  ["win", "win"],
  ["championId", "championId"],
  ["summoner1Id", "summoner1Id"],
  ["summoner2Id", "summoner2Id"],
  ["gameEndedInEarlySurrender", "gameEndedInEarlySurrender"],
  ["gameEndedInSurrender", "gameEndedInSurrender"],
] as const;

it.each(
  infoFields,
)("경기 원본 %s의 누락·null·빈 문자열은 %s NOT_PROVIDED다", (source, field) => {
  // Arrange: 각 경우의 입력을 순회한다.
  for (const missing of [undefined, null, ""]) {
    // Arrange
    const body = matchResponse();

    if (missing === undefined) {
      Reflect.deleteProperty(body.info, source);
    } else {
      Reflect.set(body.info, source, missing);
    }

    // Act
    const match = Result.unwrap(
      parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
    );

    // Assert
    expect(match[field]).toEqual({ status: "NOT_PROVIDED" });
  }
});
it.each(
  participantFields,
)("참가자 원본 %s의 누락·null·빈 문자열은 %s NOT_PROVIDED다", (source, field) => {
  // Arrange: 각 경우의 입력을 순회한다.
  for (const missing of [undefined, null, ""]) {
    // Arrange
    const body = matchResponse();

    if (missing === undefined) {
      Reflect.deleteProperty(body.info.participants[1], source);
    } else {
      Reflect.set(body.info.participants[1], source, missing);
    }

    // Act
    const match = Result.unwrap(
      parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
    );

    // Assert
    expect(match[field]).toEqual({ status: "NOT_PROVIDED" });
  }
});
it.each([
  ...infoFields,
  ...participantFields,
])("원본 %s의 잘못된 자료형은 미제공으로 숨기지 않고 거부한다", (source) => {
  // Arrange
  const body = matchResponse();
  const target = infoFields.some(([key]) => key === source)
    ? body.info
    : body.info.participants[1];
  Reflect.set(target, source, { invalid: true });

  // Act
  const parsedMatch = parsePlayerMatch(
    body,
    timelineResponse(),
    "KR_1",
    "target",
  );

  // Assert
  expect(parsedMatch).toMatchObject({
    type: "Failure",
    error: { reason: "INVALID_RESPONSE" },
  });
});
it.each([
  ["gameMode", "FUTURE_MODE"],
  ["mapId", 999999],
  ["teamPosition", "ROAMER"],
] as const)("미등록 분류 %s=%s는 UNKNOWN이다", (source, value) => {
  // Arrange
  const body = matchResponse();
  Reflect.set(
    source === "teamPosition" ? body.info.participants[1] : body.info,
    source,
    value,
  );

  // Act
  const match = Result.unwrap(
    parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
  );

  // Assert
  expect(match[source === "teamPosition" ? "position" : source]).toEqual({
    status: "UNKNOWN",
  });
});
it.each([
  450, 720,
])("칼바람 큐 %i는 역할 원본이 없어도 AVAILABLE NONE이며 상대 비교는 UNKNOWN이다", (queueId) => {
  // Arrange
  const body = matchResponse();
  body.info.queueId = queueId;
  Reflect.deleteProperty(body.info.participants[1], "teamPosition");

  // Act
  const match = Result.unwrap(
    parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
  );

  // Assert
  expect(match.position).toEqual({ status: "AVAILABLE", value: "NONE" });
  expect(
    match.laningSnapshots.every(
      (item) => item.opponentDifference.status === "UNKNOWN",
    ),
  ).toBe(true);
});
it("정상 원본의 0·false·소수·음수를 확보된 값으로 유지한다", () => {
  // Arrange: 테스트 인자와 명시한 입력을 사용한다.

  // Act
  const match = Result.unwrap(
    parsePlayerMatch(matchResponse(), timelineResponse(), "KR_1", "target"),
  );

  // Assert
  expect(match.gameEndedInEarlySurrender).toEqual({
    status: "AVAILABLE",
    value: false,
  });
  expect(match.stats.combat.deaths).toEqual({ status: "AVAILABLE", value: 0 });
  expect(match.stats.laning.goldPerMinute).toEqual({
    status: "AVAILABLE",
    value: 412.5,
  });
  expect(match.stats.vision.visionScoreAdvantageLaneOpponent).toEqual({
    status: "AVAILABLE",
    value: -0.35,
  });

  // Act
  const isEligible = match.isEligibleForAnalysis();

  // Assert
  expect(isEligible).toBe(true);
});

const rootStats = new Set([
  "enemyMissingPings",
  "dangerPings",
  "retreatPings",
  "getBackPings",
  "onMyWayPings",
  "allInPings",
  "assistMePings",
  "commandPings",
  "enemyVisionPings",
  "needVisionPings",
  "pushPings",
  "holdPings",
  "visionWardsBoughtInGame",
  "wardsPlaced",
  "wardsKilled",
  "visionScore",
  "detectorWardsPlaced",
  "kills",
  "deaths",
  "assists",
  "totalDamageDealtToChampions",
  "firstBloodKill",
  "firstBloodAssist",
  "totalEnemyJungleMinionsKilled",
  "turretTakedowns",
  "inhibitorTakedowns",
  "damageDealtToTurrets",
  "objectivesStolen",
  "firstTowerKill",
  "firstTowerAssist",
  "totalDamageTaken",
  "damageSelfMitigated",
  "longestTimeSpentLiving",
  "totalHealsOnTeammates",
  "totalDamageShieldedOnTeammates",
  "timeCCingOthers",
]);
const statFields = Object.entries(emptyPlayerMatchStats()).flatMap(
  ([group, values]) =>
    Object.keys(values).map((field) => ({
      group: group as keyof ReturnType<typeof emptyPlayerMatchStats>,
      field,
    })),
);
it.each(
  statFields,
)("통계 $group.$field의 원본 누락·null은 NOT_PROVIDED이며 잘못된 값은 거부한다", ({
  group,
  field,
}) => {
  // Arrange: 각 경우의 입력을 순회한다.
  for (const missing of [undefined, null, "", "  "]) {
    // Arrange
    const body = matchResponse();
    const target = rootStats.has(field)
      ? body.info.participants[1]
      : body.info.participants[1].challenges;

    if (missing === undefined) {
      Reflect.deleteProperty(target, field);
    } else {
      Reflect.set(target, field, missing);
    }

    // Act
    const match = Result.unwrap(
      parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
    );

    // Assert
    expect(Reflect.get(match.stats[group], field)).toEqual({
      status: "NOT_PROVIDED",
    });
  }

  // Arrange
  const body = matchResponse();
  Reflect.set(
    rootStats.has(field)
      ? body.info.participants[1]
      : body.info.participants[1].challenges,
    field,
    "invalid",
  );

  // Act
  const isRejected = Result.isFailure(
    parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
  );

  // Assert
  expect(isRejected).toBe(true);
});
it.each([
  null,
  undefined,
])("challenges 전체가 %s이면 하위 통계는 NOT_PROVIDED다", (value) => {
  // Arrange
  const body = matchResponse();
  Reflect.set(body.info.participants[1], "challenges", value);

  // Act
  const match = Result.unwrap(
    parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
  );

  // Assert
  expect(match.stats.laning.goldPerMinute).toEqual({ status: "NOT_PROVIDED" });
});
it.each([
  null,
  "",
  undefined,
])("식별 키 누락 %s는 정상 경기로 만들지 않는다", (value) => {
  // Arrange
  const body = matchResponse();
  Reflect.set(body.info, "queueId", value);

  // Act
  const isRejected = Result.isFailure(
    parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
  );

  // Assert
  expect(isRejected).toBe(true);
});
it("상세·Timeline의 경기 ID 불일치와 대상 플레이어 부재는 거부한다", () => {
  // Arrange
  const body = matchResponse();
  body.metadata.matchId = "other";

  // Act
  const isRejected = Result.isFailure(
    parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
  );

  // Assert
  expect(isRejected).toBe(true);

  // Act
  const isRejected2 = Result.isFailure(
    parsePlayerMatch(matchResponse(), timelineResponse(), "KR_1", "missing"),
  );

  // Assert
  expect(isRejected2).toBe(true);

  // Arrange
  const timeline = timelineResponse();
  timeline.metadata.matchId = "other";

  // Act
  const isRejected3 = Result.isFailure(
    parsePlayerMatch(matchResponse(), timeline, "KR_1", "target"),
  );

  // Assert
  expect(isRejected3).toBe(true);
});
it("다른 참여자의 불필요한 통계는 수집을 막지 않는다", () => {
  // Arrange
  const body = matchResponse();
  Reflect.set(body.info.participants[0], "kills", "invalid");

  // Act
  const parsedMatch = Result.isSuccess(
    parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
  );

  // Assert
  expect(parsedMatch).toBe(true);
});

it("모든 일반 원본 값이 누락되어도 경기 객체와 중첩 데이터에 null·undefined가 남지 않는다", () => {
  // Arrange
  const body = matchResponse();

  for (const [source] of infoFields) {
    Reflect.deleteProperty(body.info, source);
  }

  for (const [source] of participantFields) {
    Reflect.deleteProperty(body.info.participants[1], source);
  }

  Reflect.deleteProperty(body.info.participants[1], "challenges");

  // Act
  const match = Result.unwrap(
    parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
  );
  /** @description 식별 값·상태 객체·배열 전체를 순회해 도메인 내부의 암묵적인 빈 값 유출을 확인한다. */

  // Assert
  function assertNoNullish(value: unknown): void {
    expect(value).not.toBeNull();
    expect(value).not.toBeUndefined();

    if (value !== null && typeof value === "object") {
      Object.values(value).forEach(assertNoNullish);
    }
  }
  assertNoNullish(match);
  assertNoNullish(match.startedAt);
});

it.each([
  Number.NaN,
  Number.POSITIVE_INFINITY,
  11.5,
])("잘못된 숫자 분류 %s는 UNKNOWN으로 숨기지 않는다", (value) => {
  // Arrange
  const body = matchResponse();
  body.info.mapId = value;

  // Act
  const isRejected = Result.isFailure(
    parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
  );

  // Assert
  expect(isRejected).toBe(true);
});
it.each([
  null,
  undefined,
])("종료 타임스탬프 %s인 구형 응답의 진행 시간을 초로 변환한다", (value) => {
  // Arrange
  const body = matchResponse();
  Reflect.set(body.info, "gameEndTimestamp", value);
  body.info.gameDuration = 1800000;

  // Act
  const match = Result.unwrap(
    parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
  );

  // Assert
  expect(match.durationSeconds).toEqual({ status: "AVAILABLE", value: 1800 });
});
