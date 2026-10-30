import { expect, it } from "vitest";
import { createPlayerMatchData } from "../testing/createPlayerMatchData";
import { PlayerMatch } from "./PlayerMatch";
import type { PlayerMatchData } from "./types/PlayerMatchData.type";

it("같은 경기에서도 PUUID가 다른 플레이어 기록을 구분한다", () => {
  const first = new PlayerMatch(createPlayerMatchData());
  const second = new PlayerMatch(createPlayerMatchData({ puuid: "other" }));
  expect(first.matchId).toBe(second.matchId);
  expect(first.puuid).not.toBe(second.puuid);
});

it("입력과 반환 Date의 수정이 내부 시작 시각을 바꾸지 않는다", () => {
  const date = new Date(0);
  const match = new PlayerMatch(
    createPlayerMatchData({ startedAt: { status: "AVAILABLE", value: date } }),
  );
  date.setTime(100);
  const returned = match.startedAt;
  if (returned.status === "AVAILABLE") returned.value.setTime(200);
  expect(match.startedAt).toEqual({ status: "AVAILABLE", value: new Date(0) });
});

const valueFields = [
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
  valueFields,
)("%s의 미제공·판별 불가 상태를 null 없이 보존한다", (field) => {
  for (const status of ["NOT_PROVIDED", "UNKNOWN"] as const) {
    const data = createPlayerMatchData({ [field]: { status } });
    expect(new PlayerMatch(data)[field]).toEqual({ status });
  }
});

it.each([
  "endOfGameResult",
  "gameEndedInEarlySurrender",
] as const)("%s가 미제공 또는 판별 불가면 분석에서 제외한다", (field) => {
  for (const status of ["NOT_PROVIDED", "UNKNOWN"] as const) {
    expect(
      new PlayerMatch(
        createPlayerMatchData({ [field]: { status } }),
      ).isEligibleForAnalysis(),
    ).toBe(false);
  }
});
it.each([
  false,
  true,
])("일반 항복 %s는 정상 완료 경기의 분석 포함 여부를 바꾸지 않는다", (value) => {
  expect(
    new PlayerMatch(
      createPlayerMatchData({
        gameEndedInSurrender: { status: "AVAILABLE", value },
      }),
    ).isEligibleForAnalysis(),
  ).toBe(true);
});
it("초반 항복이나 비정상 종료는 분석에서 제외한다", () => {
  expect(
    new PlayerMatch(
      createPlayerMatchData({
        gameEndedInEarlySurrender: { status: "AVAILABLE", value: true },
      }),
    ).isEligibleForAnalysis(),
  ).toBe(false);
  expect(
    new PlayerMatch(
      createPlayerMatchData({
        endOfGameResult: { status: "AVAILABLE", value: "AbortUnexpected" },
      }),
    ).isEligibleForAnalysis(),
  ).toBe(false);
});
it.each<Partial<PlayerMatchData>>([
  { gameMode: { status: "AVAILABLE", value: "ARAM" } },
  { mapId: { status: "AVAILABLE", value: 12 } },
  { queueId: 450 },
  { queueId: 720 },
])("칼바람 분류 %j이면 미제공 역할도 확보된 NONE으로 결정한다", (classification) => {
  const match = new PlayerMatch(
    createPlayerMatchData({
      ...classification,
      position: { status: "NOT_PROVIDED" },
    }),
  );
  expect(match.position).toEqual({ status: "AVAILABLE", value: "NONE" });
  expect(
    match.laningSnapshots.every(
      (snapshot) => snapshot.opponentDifference.status === "UNKNOWN",
    ),
  ).toBe(true);
});
it("입력 상태와 통계를 변경해도 저장할 기록은 바뀌지 않는다", () => {
  const data = createPlayerMatchData();
  const match = new PlayerMatch(data);
  Reflect.set(data.gameId, "value", 999);
  Reflect.set(data.stats.combat.kda, "status", "UNKNOWN");
  expect(match.gameId).toEqual({ status: "AVAILABLE", value: 1 });
  expect(match.stats.combat.kda).toEqual({ status: "NOT_PROVIDED" });
  expect(Reflect.set(match.gameId, "value", 100)).toBe(false);
});

it.each(
  valueFields,
)("실행 시 %s가 누락되거나 null이어도 도메인에는 NOT_PROVIDED만 남긴다", (field) => {
  for (const value of [null, undefined]) {
    const data = createPlayerMatchData();
    if (value === undefined) Reflect.deleteProperty(data, field);
    else Reflect.set(data, field, value);
    expect(new PlayerMatch(data)[field]).toEqual({ status: "NOT_PROVIDED" });
  }
});

it("빈 Timeline 배열도 10·15분의 명시적인 미제공 상태로 채운다", () => {
  const match = new PlayerMatch(createPlayerMatchData({ laningSnapshots: [] }));
  expect(match.laningSnapshots.map((item) => item.minute)).toEqual([10, 15]);
  expect(
    match.laningSnapshots.every(
      (item) =>
        item.own.status === "NOT_PROVIDED" &&
        item.opponentDifference.status === "UNKNOWN",
    ),
  ).toBe(true);
});
