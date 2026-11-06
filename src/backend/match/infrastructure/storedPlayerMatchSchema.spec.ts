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
  // Arrange: 각 경우의 입력을 순회한다.
  for (const status of ["NOT_PROVIDED", "UNKNOWN"] as const) {
    // Arrange
    const match = new PlayerMatch(
      createPlayerMatchData({ [field]: { status } }),
    );

    // Act
    const stored = toStoredPlayerMatch(match);

    // Assert
    expect(stored[field]).toBeNull();
    expect(stored.fieldStates[field]).toBe(status);

    // Act
    const restored = new PlayerMatch(
      storedPlayerMatchSchema.parse(JSON.parse(JSON.stringify(stored))),
    );

    // Assert
    expect(restored[field]).toEqual({ status });
    expect(restored).toEqual(match);
  }
});
it.each(
  fields,
)("기존 DB의 %s NULL은 UNKNOWN이 아니라 NOT_PROVIDED로 복원한다", (field) => {
  // Arrange
  const stored = toStoredPlayerMatch(new PlayerMatch(createPlayerMatchData()));
  Reflect.set(stored, field, null);

  // Act
  const restored = new PlayerMatch(storedPlayerMatchSchema.parse(stored));

  // Assert
  expect(restored[field]).toEqual({ status: "NOT_PROVIDED" });
});
it("확보된 값과 0·false는 DB 직렬화 후에도 그대로 복원한다", () => {
  // Arrange
  const match = new PlayerMatch(
    createPlayerMatchData({
      gameId: { status: "AVAILABLE", value: 0 },
      win: { status: "AVAILABLE", value: false },
    }),
  );

  // Act
  const restored = new PlayerMatch(
    storedPlayerMatchSchema.parse(
      JSON.parse(JSON.stringify(toStoredPlayerMatch(match))),
    ),
  );

  // Assert
  expect(restored).toEqual(match);
});
it("상태 맵이나 확보된 값의 잘못된 타입은 조용히 미제공으로 바꾸지 않는다", () => {
  // Arrange
  const stored = toStoredPlayerMatch(new PlayerMatch(createPlayerMatchData()));

  // Act
  const isValid = storedPlayerMatchSchema.safeParse({
    ...stored,
    fieldStates: { gameId: "INVALID" },
  }).success;

  // Assert
  expect(isValid).toBe(false);

  // Act
  const isValid2 = storedPlayerMatchSchema.safeParse({
    ...stored,
    gameId: "invalid",
  }).success;

  // Assert
  expect(isValid2).toBe(false);
});
it("미등록 저장 분류는 UNKNOWN, 잘못된 분류 자료형은 오류다", () => {
  // Arrange
  const stored = toStoredPlayerMatch(new PlayerMatch(createPlayerMatchData()));

  // Act
  const restored = new PlayerMatch(
    storedPlayerMatchSchema.parse({
      ...stored,
      position: "ROAMER",
      gameMode: "FUTURE_MODE",
      mapId: 99999,
    }),
  );

  // Assert
  expect(restored.position).toEqual({ status: "UNKNOWN" });
  expect(restored.gameMode).toEqual({ status: "UNKNOWN" });
  expect(restored.mapId).toEqual({ status: "UNKNOWN" });

  // Act
  const isValid = storedPlayerMatchSchema.safeParse({
    ...stored,
    position: 123,
  }).success;

  // Assert
  expect(isValid).toBe(false);
});
it("과거 Timeline의 원시 수치·null과 누락된 시점을 상태로 복원한다", () => {
  // Arrange
  const stored = toStoredPlayerMatch(new PlayerMatch(createPlayerMatchData()));

  // Act
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

  // Assert
  expect(restored.laningSnapshots[0].own).toMatchObject({
    status: "AVAILABLE",
    value: { gold: { status: "AVAILABLE", value: 5000 } },
  });
  expect(restored.laningSnapshots[0].opponentDifference).toEqual({
    status: "UNKNOWN",
  });
  expect(restored.laningSnapshots[1].own).toEqual({ status: "NOT_PROVIDED" });
});
