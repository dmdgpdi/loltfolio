import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { createRiotMatchResponse as matchResponse } from "../../testing/createRiotMatchResponse";
import { createRiotTimelineResponse as timelineResponse } from "../../testing/createRiotTimelineResponse";
import { parsePlayerMatch } from "./parsePlayerMatch";

it("10·15분 실제 시각과 본인·상대의 수치 차이를 보존한다", () => {
  const match = Result.unwrap(
    parsePlayerMatch(matchResponse(), timelineResponse(), "KR_1", "target"),
  );
  expect(match.laningSnapshots[0]).toMatchObject({
    minute: 10,
    actualTimestampMs: { status: "AVAILABLE", value: 600225 },
    own: {
      status: "AVAILABLE",
      value: { gold: { status: "AVAILABLE", value: 5000 } },
    },
    opponentDifference: {
      status: "AVAILABLE",
      value: {
        gold: { status: "AVAILABLE", value: 500 },
        laneCs: { status: "AVAILABLE", value: -10 },
      },
    },
  });
});
it("15분 전에 끝난 경기에서도 15분 표본 미제공 상태를 남긴다", () => {
  const body = matchResponse();
  body.info.gameDuration = 800;
  const match = Result.unwrap(
    parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
  );
  expect(match.laningSnapshots[1]).toEqual({
    minute: 15,
    actualTimestampMs: { status: "NOT_PROVIDED" },
    own: { status: "NOT_PROVIDED" },
    opponentDifference: { status: "UNKNOWN" },
  });
});
it("허용 오차 밖의 프레임은 표본 미제공이며 가짜 수치를 만들지 않는다", () => {
  const timeline = timelineResponse();
  timeline.info.frames.forEach((frame) => {
    frame.timestamp += 10_000;
  });
  const match = Result.unwrap(
    parsePlayerMatch(matchResponse(), timeline, "KR_1", "target"),
  );
  expect(
    match.laningSnapshots.every(
      (item) =>
        item.own.status === "NOT_PROVIDED" &&
        item.actualTimestampMs.status === "NOT_PROVIDED",
    ),
  ).toBe(true);
});
it.each([
  null,
  undefined,
])("본인 프레임 %s는 미제공이고 차이는 계산 불가다", (value) => {
  const timeline = timelineResponse();
  Reflect.set(timeline.info.frames[0].participantFrames, "1", value);
  const match = Result.unwrap(
    parsePlayerMatch(matchResponse(), timeline, "KR_1", "target"),
  );
  expect(match.laningSnapshots[0].own).toEqual({ status: "NOT_PROVIDED" });
  expect(match.laningSnapshots[0].opponentDifference).toEqual({
    status: "UNKNOWN",
  });
});
it.each([
  null,
  undefined,
])("본인 골드 %s는 NOT_PROVIDED, 계산된 골드 차이는 UNKNOWN이다", (value) => {
  const timeline = timelineResponse();
  Reflect.set(
    timeline.info.frames[0].participantFrames["1"],
    "totalGold",
    value,
  );
  const match = Result.unwrap(
    parsePlayerMatch(matchResponse(), timeline, "KR_1", "target"),
  );
  const snapshot = match.laningSnapshots[0];
  expect(snapshot.own).toMatchObject({
    status: "AVAILABLE",
    value: { gold: { status: "NOT_PROVIDED" } },
  });
  expect(snapshot.opponentDifference).toMatchObject({
    status: "AVAILABLE",
    value: {
      gold: { status: "UNKNOWN" },
      xp: { status: "AVAILABLE", value: 200 },
    },
  });
});
it("상대 후보가 여럿이면 임의 선택하지 않고 UNKNOWN으로 남긴다", () => {
  const body = matchResponse();
  body.info.participants.push({
    ...body.info.participants[0],
    participantId: 7,
  });
  const match = Result.unwrap(
    parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
  );
  expect(match.laningSnapshots[0].opponentDifference).toEqual({
    status: "UNKNOWN",
  });
});
it("프레임의 잘못된 수치 자료형은 누락으로 숨기지 않는다", () => {
  const timeline = timelineResponse();
  Reflect.set(
    timeline.info.frames[0].participantFrames["1"],
    "totalGold",
    "invalid",
  );
  expect(
    Result.isFailure(
      parsePlayerMatch(matchResponse(), timeline, "KR_1", "target"),
    ),
  ).toBe(true);
});

it.each([
  null,
  undefined,
])("상대 프레임 %s는 차이를 UNKNOWN으로 만들고 본인 기록은 유지한다", (value) => {
  const timeline = timelineResponse();
  Reflect.set(timeline.info.frames[0].participantFrames, "6", value);
  const match = Result.unwrap(
    parsePlayerMatch(matchResponse(), timeline, "KR_1", "target"),
  );
  expect(match.laningSnapshots[0].own.status).toBe("AVAILABLE");
  expect(match.laningSnapshots[0].opponentDifference).toEqual({
    status: "UNKNOWN",
  });
});
