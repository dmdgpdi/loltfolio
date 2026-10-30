CREATE TABLE "match_syncs" (
	"puuid" text,
	"queue_id" integer,
	"status" text NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_succeeded_at" timestamp with time zone,
	"retry_available_at" timestamp with time zone,
	CONSTRAINT "match_syncs_pkey" PRIMARY KEY("puuid","queue_id")
);
--> statement-breakpoint
CREATE TABLE "player_matches" (
	"match_id" text,
	"puuid" text,
	"queue_id" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"champion" text NOT NULL,
	"position" text NOT NULL,
	"win" boolean NOT NULL,
	"game_id" bigint,
	"game_mode" text,
	"map_id" integer,
	"game_version" text,
	"duration_seconds" integer,
	"end_of_game_result" text,
	"game_ended_in_early_surrender" boolean,
	"game_ended_in_surrender" boolean,
	"champion_id" integer,
	"summoner1_id" integer,
	"summoner2_id" integer,
	"stats" jsonb NOT NULL,
	"laning_snapshots" jsonb NOT NULL,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_matches_pkey" PRIMARY KEY("match_id","puuid")
);
--> statement-breakpoint
CREATE INDEX "player_matches_player_queue_started_idx" ON "player_matches" ("puuid","queue_id","started_at" DESC NULLS LAST);