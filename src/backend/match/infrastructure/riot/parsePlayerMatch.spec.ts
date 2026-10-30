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
  for (const missing of [undefined, null, ""]) {
    const body = matchResponse();
    if (missing === undefined) Reflect.deleteProperty(body.info, source);
    else Reflect.set(body.info, source, missing);
    const match = Result.unwrap(
      parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
    );
    expect(match[field]).toEqual({ status: "NOT_PROVIDED" });
  }
});
it.each(
  participantFields,
)("참가자 원본 %s의 누락·null·빈 문자열은 %s NOT_PROVIDED다", (source, field) => {
  for (const missing of [undefined, null, ""]) {
    const body = matchResponse();
    if (missing === undefined)
      Reflect.deleteProperty(body.info.participants[1], source);
    else Reflect.set(body.info.participants[1], source, missing);
    const match = Result.unwrap(
      parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
    );
    expect(match[field]).toEqual({ status: "NOT_PROVIDED" });
  }
});
it.each([
  ...infoFields,
  ...participantFields,
])("원본 %s의 잘못된 자료형은 미제공으로 숨기지 않고 거부한다", (source) => {
  const body = matchResponse();
  const target = infoFields.some(([key]) => key === source)
    ? body.info
    : body.info.participants[1];
  Reflect.set(target, source, { invalid: true });
  expect(
    parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
  ).toMatchObject({ type: "Failure", error: { reason: "INVALID_RESPONSE" } });
});
it.each([
  ["gameMode", "FUTURE_MODE"],
  ["mapId", 999999],
  ["teamPosition", "ROAMER"],
] as const)("미등록 분류 %s=%s는 UNKNOWN이다", (source, value) => {
  const body = matchResponse();
  Reflect.set(
    source === "teamPosition" ? body.info.participants[1] : body.info,
    source,
    value,
  );
  const match = Result.unwrap(
    parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
  );
  expect(match[source === "teamPosition" ? "position" : source]).toEqual({
    status: "UNKNOWN",
  });
});
it.each([
  450, 720,
])("칼바람 큐 %i는 역할 원본이 없어도 AVAILABLE NONE이며 상대 비교는 UNKNOWN이다", (queueId) => {
  const body = matchResponse();
  body.info.queueId = queueId;
  Reflect.deleteProperty(body.info.participants[1], "teamPosition");
  const match = Result.unwrap(
    parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
  );
  expect(match.position).toEqual({ status: "AVAILABLE", value: "NONE" });
  expect(
    match.laningSnapshots.every(
      (item) => item.opponentDifference.status === "UNKNOWN",
    ),
  ).toBe(true);
});
it("정상 원본의 0·false·소수·음수를 확보된 값으로 유지한다", () => {
  const match = Result.unwrap(
    parsePlayerMatch(matchResponse(), timelineResponse(), "KR_1", "target"),
  );
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
  expect(match.isEligibleForAnalysis()).toBe(true);
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
  for (const missing of [undefined, null, "", "  "]) {
    const body = matchResponse();
    const target = rootStats.has(field)
      ? body.info.participants[1]
      : body.info.participants[1].challenges;
    if (missing === undefined) Reflect.deleteProperty(target, field);
    else Reflect.set(target, field, missing);
    const match = Result.unwrap(
      parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
    );
    expect(Reflect.get(match.stats[group], field)).toEqual({
      status: "NOT_PROVIDED",
    });
  }
  const body = matchResponse();
  Reflect.set(
    rootStats.has(field)
      ? body.info.participants[1]
      : body.info.participants[1].challenges,
    field,
    "invalid",
  );
  expect(
    Result.isFailure(
      parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
    ),
  ).toBe(true);
});
it.each([
  null,
  undefined,
])("challenges 전체가 %s이면 하위 통계는 NOT_PROVIDED다", (value) => {
  const body = matchResponse();
  Reflect.set(body.info.participants[1], "challenges", value);
  const match = Result.unwrap(
    parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
  );
  expect(match.stats.laning.goldPerMinute).toEqual({ status: "NOT_PROVIDED" });
});
it.each([
  null,
  "",
  undefined,
])("식별 키 누락 %s는 정상 경기로 만들지 않는다", (value) => {
  const body = matchResponse();
  Reflect.set(body.info, "queueId", value);
  expect(
    Result.isFailure(
      parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
    ),
  ).toBe(true);
});
it("상세·Timeline의 경기 ID 불일치와 대상 플레이어 부재는 거부한다", () => {
  const body = matchResponse();
  body.metadata.matchId = "other";
  expect(
    Result.isFailure(
      parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
    ),
  ).toBe(true);
  expect(
    Result.isFailure(
      parsePlayerMatch(matchResponse(), timelineResponse(), "KR_1", "missing"),
    ),
  ).toBe(true);
  const timeline = timelineResponse();
  timeline.metadata.matchId = "other";
  expect(
    Result.isFailure(
      parsePlayerMatch(matchResponse(), timeline, "KR_1", "target"),
    ),
  ).toBe(true);
});
it("다른 참여자의 불필요한 통계는 수집을 막지 않는다", () => {
  const body = matchResponse();
  Reflect.set(body.info.participants[0], "kills", "invalid");
  expect(
    Result.isSuccess(
      parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
    ),
  ).toBe(true);
});

it("모든 일반 원본 값이 누락되어도 경기 객체와 중첩 데이터에 null·undefined가 남지 않는다", () => {
  const body = matchResponse();
  for (const [source] of infoFields) Reflect.deleteProperty(body.info, source);
  for (const [source] of participantFields)
    Reflect.deleteProperty(body.info.participants[1], source);
  Reflect.deleteProperty(body.info.participants[1], "challenges");
  const match = Result.unwrap(
    parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
  );
  /** @description 식별 값·상태 객체·배열 전체를 순회해 도메인 내부의 암묵적인 빈 값 유출을 확인한다. */
  function assertNoNullish(value: unknown): void {
    expect(value).not.toBeNull();
    expect(value).not.toBeUndefined();
    if (value !== null && typeof value === "object")
      Object.values(value).forEach(assertNoNullish);
  }
  assertNoNullish(match);
  assertNoNullish(match.startedAt);
});

it.each([
  Number.NaN,
  Number.POSITIVE_INFINITY,
  11.5,
])("잘못된 숫자 분류 %s는 UNKNOWN으로 숨기지 않는다", (value) => {
  const body = matchResponse();
  body.info.mapId = value;
  expect(
    Result.isFailure(
      parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
    ),
  ).toBe(true);
});
it.each([
  null,
  undefined,
])("종료 타임스탬프 %s인 구형 응답의 진행 시간을 초로 변환한다", (value) => {
  const body = matchResponse();
  Reflect.set(body.info, "gameEndTimestamp", value);
  body.info.gameDuration = 1800000;
  const match = Result.unwrap(
    parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
  );
  expect(match.durationSeconds).toEqual({ status: "AVAILABLE", value: 1800 });
});
