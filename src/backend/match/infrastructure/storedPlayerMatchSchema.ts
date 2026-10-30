import { z } from "zod";
import { GameMode } from "../domain/GameMode";
import { MapId } from "../domain/MapId";
import { Position } from "../domain/Position";
import { QueueId } from "../domain/QueueId";
import { classifiedStatSchema } from "./classifiedStatSchema";
import { playerMatchStatsSchema } from "./playerMatchStatsSchema";
import { storedStatSchema } from "./storedStatSchema";

const values = z.object({
  gold: storedStatSchema(z.number()),
  xp: storedStatSchema(z.number()),
  level: storedStatSchema(z.number()),
  laneCs: storedStatSchema(z.number()),
  jungleCs: storedStatSchema(z.number()),
});
const snapshot = z.object({
  minute: z.union([z.literal(10), z.literal(15)]),
  actualTimestampMs: storedStatSchema(z.number().nonnegative()),
  own: storedStatSchema(values),
  opponentDifference: z.preprocess(
    (input) =>
      input === null || input === undefined ? { status: "UNKNOWN" } : input,
    storedStatSchema(values),
  ),
});

/** @description DB의 원시 컬럼과 별도 상태 컬럼을 조합해 검증한다. 상태가 없는 과거 값도 원본 누락·미등록 분류를 구분해 복원한다. */
export const storedPlayerMatchSchema = z.preprocess(
  (input) => {
    if (input === null || typeof input !== "object") return input;
    const row = z
      .object({
        fieldStates: z
          .record(z.string(), z.enum(["NOT_PROVIDED", "UNKNOWN"]))
          .default({}),
      })
      .safeParse(input);
    if (!row.success) return input;
    return {
      ...input,
      ...Object.fromEntries(
        Object.entries(row.data.fieldStates).map(([key, status]) => [
          key,
          { status },
        ]),
      ),
    };
  },
  z.object({
    fieldStates: z
      .record(z.string(), z.enum(["NOT_PROVIDED", "UNKNOWN"]))
      .default({}),
    matchId: z.string().min(1),
    puuid: z.string().min(1),
    queueId: z.literal(Object.values(QueueId)),
    startedAt: storedStatSchema(
      z.coerce.date().refine((date) => !Number.isNaN(date.getTime())),
    ),
    champion: storedStatSchema(z.string().min(1)),
    win: storedStatSchema(z.boolean()),
    gameId: storedStatSchema(z.int()),
    gameVersion: storedStatSchema(z.string().min(1)),
    durationSeconds: storedStatSchema(z.number().nonnegative()),
    endOfGameResult: storedStatSchema(z.string().min(1)),
    gameEndedInEarlySurrender: storedStatSchema(z.boolean()),
    gameEndedInSurrender: storedStatSchema(z.boolean()),
    championId: storedStatSchema(z.int()),
    summoner1Id: storedStatSchema(z.int()),
    summoner2Id: storedStatSchema(z.int()),
    position: z.union([
      storedStatSchema(z.literal(Object.values(Position))),
      classifiedStatSchema(Object.values(Position)),
    ]),
    gameMode: z.union([
      storedStatSchema(z.literal(Object.values(GameMode))),
      classifiedStatSchema(Object.values(GameMode)),
    ]),
    mapId: z.union([
      storedStatSchema(z.literal(Object.values(MapId))),
      classifiedStatSchema(Object.values(MapId)),
    ]),
    stats: playerMatchStatsSchema,
    laningSnapshots: z.array(snapshot).transform((snapshots) =>
      ([10, 15] as const).map(
        (minute) =>
          snapshots.find((item) => item.minute === minute) ?? {
            minute,
            actualTimestampMs: { status: "NOT_PROVIDED" as const },
            own: { status: "NOT_PROVIDED" as const },
            opponentDifference: { status: "UNKNOWN" as const },
          },
      ),
    ),
  }),
);
