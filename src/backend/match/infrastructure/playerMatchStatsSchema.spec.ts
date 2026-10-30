import { expect, it } from "vitest";
import { emptyPlayerMatchStats } from "../domain/emptyPlayerMatchStats";
import { playerMatchStatsSchema } from "./playerMatchStatsSchema";

it("기존 DB 원시값과 null을 각각 확보됨과 미제공으로 복원한다", () => {
  const stats = emptyPlayerMatchStats();
  const restored = playerMatchStatsSchema.parse({
    ...stats,
    combat: { ...stats.combat, kills: 0, firstBloodKill: false, kda: null },
  });

  expect(restored.combat.kills).toEqual({ status: "AVAILABLE", value: 0 });
  expect(restored.combat.firstBloodKill).toEqual({
    status: "AVAILABLE",
    value: false,
  });
  expect(restored.combat.kda).toEqual({ status: "NOT_PROVIDED" });
});

it("계산·판별 불가 상태는 미제공과 구분하여 JSON 저장 후에도 복원한다", () => {
  const stats = emptyPlayerMatchStats();
  const stored = {
    ...stats,
    combat: { ...stats.combat, kda: { status: "UNKNOWN" } },
  };

  const restored = playerMatchStatsSchema.parse(
    JSON.parse(JSON.stringify(stored)),
  );

  expect(restored.combat.kda).toEqual({ status: "UNKNOWN" });
  expect(restored.combat.kills).toEqual({ status: "NOT_PROVIDED" });
});

it("확보된 수치의 잘못된 자료형은 거부한다", () => {
  const stats = emptyPlayerMatchStats();
  expect(
    playerMatchStatsSchema.safeParse({
      ...stats,
      combat: { ...stats.combat, kills: { status: "AVAILABLE", value: "3" } },
    }).success,
  ).toBe(false);
});
