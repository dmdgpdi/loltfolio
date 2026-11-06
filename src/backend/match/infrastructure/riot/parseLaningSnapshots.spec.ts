import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { createRiotMatchResponse as matchResponse } from "../../testing/createRiotMatchResponse";
import { createRiotTimelineResponse as timelineResponse } from "../../testing/createRiotTimelineResponse";
import { parsePlayerMatch } from "./parsePlayerMatch";

it("10·15분 실제 시각과 본인·상대의 수치 차이를 보존한다", () => {
  // Arrange: 테스트 인자와 명시한 입력을 사용한다.

  // Act
  const match = Result.unwrap(
    parsePlayerMatch(matchResponse(), timelineResponse(), "KR_1", "target"),
  );

  // Assert
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
  // Arrange
  const body = matchResponse();
  body.info.gameDuration = 800;

  // Act
  const match = Result.unwrap(
    parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
  );

  // Assert
  expect(match.laningSnapshots[1]).toEqual({
    minute: 15,
    actualTimestampMs: { status: "NOT_PROVIDED" },
    own: { status: "NOT_PROVIDED" },
    opponentDifference: { status: "UNKNOWN" },
  });
});
it("허용 오차 밖의 프레임은 표본 미제공이며 가짜 수치를 만들지 않는다", () => {
  // Arrange
  const timeline = timelineResponse();

  for (const frame of timeline.info.frames) {
    frame.timestamp += 10_000;
  }

  // Act
  const match = Result.unwrap(
    parsePlayerMatch(matchResponse(), timeline, "KR_1", "target"),
  );

  // Assert
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
  // Arrange
  const timeline = timelineResponse();
  Reflect.set(timeline.info.frames[0].participantFrames, "1", value);

  // Act
  const match = Result.unwrap(
    parsePlayerMatch(matchResponse(), timeline, "KR_1", "target"),
  );

  // Assert
  expect(match.laningSnapshots[0].own).toEqual({ status: "NOT_PROVIDED" });
  expect(match.laningSnapshots[0].opponentDifference).toEqual({
    status: "UNKNOWN",
  });
});
it.each([
  null,
  undefined,
])("본인 골드 %s는 NOT_PROVIDED, 계산된 골드 차이는 UNKNOWN이다", (value) => {
  // Arrange
  const timeline = timelineResponse();
  Reflect.set(
    timeline.info.frames[0].participantFrames["1"],
    "totalGold",
    value,
  );

  // Act
  const match = Result.unwrap(
    parsePlayerMatch(matchResponse(), timeline, "KR_1", "target"),
  );
  const snapshot = match.laningSnapshots[0];

  // Assert
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
  // Arrange
  const body = matchResponse();
  body.info.participants.push({
    ...body.info.participants[0],
    participantId: 7,
  });

  // Act
  const match = Result.unwrap(
    parsePlayerMatch(body, timelineResponse(), "KR_1", "target"),
  );

  // Assert
  expect(match.laningSnapshots[0].opponentDifference).toEqual({
    status: "UNKNOWN",
  });
});
it("프레임의 잘못된 수치 자료형은 누락으로 숨기지 않는다", () => {
  // Arrange
  const timeline = timelineResponse();
  Reflect.set(
    timeline.info.frames[0].participantFrames["1"],
    "totalGold",
    "invalid",
  );

  // Act
  const isRejected = Result.isFailure(
    parsePlayerMatch(matchResponse(), timeline, "KR_1", "target"),
  );

  // Assert
  expect(isRejected).toBe(true);
});

it.each([
  null,
  undefined,
])("상대 프레임 %s는 차이를 UNKNOWN으로 만들고 본인 기록은 유지한다", (value) => {
  // Arrange
  const timeline = timelineResponse();
  Reflect.set(timeline.info.frames[0].participantFrames, "6", value);

  // Act
  const match = Result.unwrap(
    parsePlayerMatch(matchResponse(), timeline, "KR_1", "target"),
  );

  // Assert
  expect(match.laningSnapshots[0].own.status).toBe("AVAILABLE");
  expect(match.laningSnapshots[0].opponentDifference).toEqual({
    status: "UNKNOWN",
  });
});

it.each([
  -5_001, -5_000, 5_000, 5_001,
])("10분 프레임 오차 %i밀리초의 5초 경계를 유지한다", (offset) => {
  // Arrange
  const timeline = timelineResponse();
  timeline.info.frames[0].timestamp = 600_000 + offset;

  // Act
  const match = Result.unwrap(
    parsePlayerMatch(matchResponse(), timeline, "KR_1", "target"),
  );
  const snapshot = match.laningSnapshots[0];

  // Assert
  if (Math.abs(offset) <= 5_000) {
    // Assert
    expect(snapshot.actualTimestampMs).toEqual({
      status: "AVAILABLE",
      value: 600_000 + offset,
    });
    expect(snapshot.own.status).toBe("AVAILABLE");
  } else {
    // Assert
    expect(snapshot.actualTimestampMs).toEqual({ status: "NOT_PROVIDED" });
    expect(snapshot.own.status).toBe("NOT_PROVIDED");
  }
});

it("동일 거리의 프레임은 원본 순서에서 첫 프레임을 선택한다", () => {
  // Arrange
  const timeline = timelineResponse();
  const first = timeline.info.frames[0];
  first.timestamp = 595_000;
  const second = structuredClone(first);
  second.timestamp = 605_000;
  second.participantFrames["1"].totalGold = 9999;
  timeline.info.frames.unshift(second);

  // Act
  const match = Result.unwrap(
    parsePlayerMatch(matchResponse(), timeline, "KR_1", "target"),
  );

  // Assert
  expect(match.laningSnapshots[0]).toMatchObject({
    actualTimestampMs: { status: "AVAILABLE", value: 605_000 },
    own: {
      status: "AVAILABLE",
      value: { gold: { status: "AVAILABLE", value: 9999 } },
    },
  });
});

it("본인 프레임이 없으면 시각만 유지하고 잘못된 상대 프레임은 읽지 않는다", () => {
  // Arrange
  const timeline = timelineResponse();
  Reflect.set(timeline.info.frames[0].participantFrames, "1", null);
  Reflect.set(timeline.info.frames[0].participantFrames, "6", {
    totalGold: "invalid",
  });

  // Act
  const match = Result.unwrap(
    parsePlayerMatch(matchResponse(), timeline, "KR_1", "target"),
  );

  // Assert
  expect(match.laningSnapshots[0]).toEqual({
    minute: 10,
    actualTimestampMs: { status: "AVAILABLE", value: 600225 },
    own: { status: "NOT_PROVIDED" },
    opponentDifference: { status: "UNKNOWN" },
  });
});
