import { expect, it } from "vitest";
import { PlayerMatch } from "../domain/PlayerMatch";
import { createPlayerMatchData } from "../testing/createPlayerMatchData";
import { toStoredPlayerMatch } from "./persistence/toStoredPlayerMatch";
import { storedPlayerMatchSchema } from "./storedPlayerMatchSchema";

const fields = [
  "startedAt",
  "champion",
  "position",
  "win",
  "gameId",
  "gameMode",
  "mapId",
  "gameVersion",
  "durationSeconds",
  "endOfGameResult",
  "gameEndedInEarlySurrender",
  "gameEndedInSurrender",
  "championId",
  "summoner1Id",
  "summoner2Id",
] as const;
it.each(
  fields,
)("%s의 NOT_PROVIDED와 UNKNOWN을 SQL 값·상태로 분리하고 정확히 복원한다", (field) => {
  for (const status of ["NOT_PROVIDED", "UNKNOWN"] as const) {
    const match = new PlayerMatch(
      createPlayerMatchData({ [field]: { status } }),
    );
    const stored = toStoredPlayerMatch(match);
    expect(stored[field]).toBeNull();
    expect(stored.fieldStates[field]).toBe(status);
    const restored = new PlayerMatch(
      storedPlayerMatchSchema.parse(JSON.parse(JSON.stringify(stored))),
    );
    expect(restored[field]).toEqual({ status });
    expect(restored).toEqual(match);
  }
});
it.each(
  fields,
)("기존 DB의 %s NULL은 UNKNOWN이 아니라 NOT_PROVIDED로 복원한다", (field) => {
  const stored = toStoredPlayerMatch(new PlayerMatch(createPlayerMatchData()));
  Reflect.set(stored, field, null);
  const restored = new PlayerMatch(storedPlayerMatchSchema.parse(stored));
  expect(restored[field]).toEqual({ status: "NOT_PROVIDED" });
});
it("확보된 값과 0·false는 DB 직렬화 후에도 그대로 복원한다", () => {
  const match = new PlayerMatch(
    createPlayerMatchData({
      gameId: { status: "AVAILABLE", value: 0 },
      win: { status: "AVAILABLE", value: false },
    }),
  );
  const restored = new PlayerMatch(
    storedPlayerMatchSchema.parse(
      JSON.parse(JSON.stringify(toStoredPlayerMatch(match))),
    ),
  );
  expect(restored).toEqual(match);
});
it("상태 맵이나 확보된 값의 잘못된 타입은 조용히 미제공으로 바꾸지 않는다", () => {
  const stored = toStoredPlayerMatch(new PlayerMatch(createPlayerMatchData()));
  expect(
    storedPlayerMatchSchema.safeParse({
      ...stored,
      fieldStates: { gameId: "INVALID" },
    }).success,
  ).toBe(false);
  expect(
    storedPlayerMatchSchema.safeParse({ ...stored, gameId: "invalid" }).success,
  ).toBe(false);
});
it("미등록 저장 분류는 UNKNOWN, 잘못된 분류 자료형은 오류다", () => {
  const stored = toStoredPlayerMatch(new PlayerMatch(createPlayerMatchData()));
  const restored = new PlayerMatch(
    storedPlayerMatchSchema.parse({
      ...stored,
      position: "ROAMER",
      gameMode: "FUTURE_MODE",
      mapId: 99999,
    }),
  );
  expect(restored.position).toEqual({ status: "UNKNOWN" });
  expect(restored.gameMode).toEqual({ status: "UNKNOWN" });
  expect(restored.mapId).toEqual({ status: "UNKNOWN" });
  expect(
    storedPlayerMatchSchema.safeParse({ ...stored, position: 123 }).success,
  ).toBe(false);
});
it("과거 Timeline의 원시 수치·null과 누락된 시점을 상태로 복원한다", () => {
  const stored = toStoredPlayerMatch(new PlayerMatch(createPlayerMatchData()));
  const restored = new PlayerMatch(
    storedPlayerMatchSchema.parse({
      ...stored,
      laningSnapshots: [
        {
          minute: 10,
          actualTimestampMs: 600000,
          own: { gold: 5000, xp: 4000, level: 9, laneCs: 80, jungleCs: 0 },
          opponentDifference: null,
        },
      ],
    }),
  );
  expect(restored.laningSnapshots[0].own).toMatchObject({
    status: "AVAILABLE",
    value: { gold: { status: "AVAILABLE", value: 5000 } },
  });
  expect(restored.laningSnapshots[0].opponentDifference).toEqual({
    status: "UNKNOWN",
  });
  expect(restored.laningSnapshots[1].own).toEqual({ status: "NOT_PROVIDED" });
});
