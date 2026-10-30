import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { GameMode } from "../../domain/types/GameMode.type";
import type { LaningSnapshot } from "../../domain/types/LaningSnapshot.type";
import type { MapId } from "../../domain/types/MapId.type";
import type { MatchSyncStatus } from "../../domain/types/MatchSyncStatus.type";
import type { PlayerMatchStats } from "../../domain/types/PlayerMatchStats.type";
import type { Position } from "../../domain/types/Position.type";
import type { QueueId } from "../../domain/types/QueueId.type";

export const matchSyncs = pgTable(
  "match_syncs",
  {
    puuid: text("puuid").notNull(),
    queueId: integer("queue_id").$type<QueueId>().notNull(),
    status: text("status").$type<MatchSyncStatus>().notNull(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lastSucceededAt: timestamp("last_succeeded_at", { withTimezone: true }),
    retryAvailableAt: timestamp("retry_available_at", { withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.puuid, table.queueId] })],
);

export const playerMatches = pgTable(
  "player_matches",
  {
    matchId: text("match_id").notNull(),
    puuid: text("puuid").notNull(),
    queueId: integer("queue_id").$type<QueueId>().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    champion: text("champion"),
    position: text("position").$type<Position>(),
    win: boolean("win"),
    gameId: bigint("game_id", { mode: "number" }),
    gameMode: text("game_mode").$type<GameMode>(),
    mapId: integer("map_id").$type<MapId>(),
    gameVersion: text("game_version"),
    durationSeconds: integer("duration_seconds"),
    endOfGameResult: text("end_of_game_result"),
    gameEndedInEarlySurrender: boolean("game_ended_in_early_surrender"),
    gameEndedInSurrender: boolean("game_ended_in_surrender"),
    championId: integer("champion_id"),
    summoner1Id: integer("summoner1_id"),
    summoner2Id: integer("summoner2_id"),
    fieldStates: jsonb("field_states")
      .$type<Record<string, "NOT_PROVIDED" | "UNKNOWN">>()
      .notNull()
      .default({}),
    // 콘텐츠에 사용할 선택 필드만 저장한다. Riot 참가자 원본 전체를 저장하지 않는다.
    stats: jsonb("stats").$type<PlayerMatchStats>().notNull(),
    laningSnapshots: jsonb("laning_snapshots")
      .$type<readonly LaningSnapshot[]>()
      .notNull(),
    collectedAt: timestamp("collected_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.matchId, table.puuid] }),
    index("player_matches_player_queue_started_idx").on(
      table.puuid,
      table.queueId,
      table.startedAt.desc(),
    ),
  ],
);
