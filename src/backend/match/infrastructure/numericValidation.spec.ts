import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { PlayerMatch } from "../domain/PlayerMatch";
import { createPlayerMatchData } from "../testing/createPlayerMatchData";
import { createRiotMatchResponse } from "../testing/createRiotMatchResponse";
import { createRiotTimelineResponse } from "../testing/createRiotTimelineResponse";
import { toStoredPlayerMatch } from "./persistence/toStoredPlayerMatch";
import { parsePlayerMatch } from "./riot/parsePlayerMatch";
import { storedPlayerMatchSchema } from "./storedPlayerMatchSchema";

it.each([
  Number.NaN,
  Infinity,
  -Infinity,
])("유효하지 않은 통계 수치 %s는 API와 저장 데이터에서 모두 거부한다", (value) => {
  const body = createRiotMatchResponse();
  Reflect.set(body.info.participants[1], "kills", value);
  expect(
    Result.isFailure(
      parsePlayerMatch(body, createRiotTimelineResponse(), "KR_1", "target"),
    ),
  ).toBe(true);
  const stored = toStoredPlayerMatch(new PlayerMatch(createPlayerMatchData()));
  expect(
    storedPlayerMatchSchema.safeParse({
      ...stored,
      stats: {
        ...stored.stats,
        combat: {
          ...stored.stats.combat,
          kills: { status: "AVAILABLE", value },
        },
      },
    }).success,
  ).toBe(false);
  const timeline = createRiotTimelineResponse();
  timeline.info.frames[0].participantFrames["1"].totalGold = value;
  expect(
    Result.isFailure(
      parsePlayerMatch(createRiotMatchResponse(), timeline, "KR_1", "target"),
    ),
  ).toBe(true);
});
it.each([
  0, -0.35, 23.25,
])("정상 통계 수치 %s는 소수·음수를 보정하지 않고 보존한다", (value) => {
  const body = createRiotMatchResponse();
  body.info.participants[1].challenges.goldPerMinute = value;
  const match = Result.unwrap(
    parsePlayerMatch(body, createRiotTimelineResponse(), "KR_1", "target"),
  );
  expect(match.stats.laning.goldPerMinute).toEqual({
    status: "AVAILABLE",
    value,
  });
});
it.each([
  1.5,
  Number.MAX_SAFE_INTEGER + 1,
  Number.MIN_SAFE_INTEGER - 1,
  Number.NaN,
  Infinity,
  -Infinity,
])("경기 ID %s는 안전한 정수가 아니면 API와 DB 복원에서 거부한다", (value) => {
  const body = createRiotMatchResponse();
  body.info.gameId = value;
  expect(
    Result.isFailure(
      parsePlayerMatch(body, createRiotTimelineResponse(), "KR_1", "target"),
    ),
  ).toBe(true);
  const stored = toStoredPlayerMatch(new PlayerMatch(createPlayerMatchData()));
  expect(
    storedPlayerMatchSchema.safeParse({ ...stored, gameId: value }).success,
  ).toBe(false);
});
it("안전한 정수의 경계값은 그대로 허용한다", () => {
  const body = createRiotMatchResponse();
  body.info.gameId = Number.MAX_SAFE_INTEGER;
  expect(
    Result.unwrap(
      parsePlayerMatch(body, createRiotTimelineResponse(), "KR_1", "target"),
    ).gameId,
  ).toEqual({ status: "AVAILABLE", value: Number.MAX_SAFE_INTEGER });
});
