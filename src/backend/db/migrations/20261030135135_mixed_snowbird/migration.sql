ALTER TABLE "player_matches" ADD COLUMN "field_states" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "player_matches" ALTER COLUMN "started_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "player_matches" ALTER COLUMN "champion" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "player_matches" ALTER COLUMN "win" DROP NOT NULL;