import { expectTypeOf, it } from "vitest";
import type { MatchCollectionService } from "../application/MatchCollectionService";
import type { RiotMatchClient } from "../application/RiotMatchClient";
import type { MatchSync } from "../domain/MatchSync";
import type { GameMode } from "../domain/types/GameMode.type";
import type { MapId } from "../domain/types/MapId.type";
import type { MatchSyncData } from "../domain/types/MatchSyncData.type";
import type { MatchSyncRepository } from "../domain/types/MatchSyncRepository.type";
import type { PlayerMatchRepository } from "../domain/types/PlayerMatchRepository.type";
import type { Position } from "../domain/types/Position.type";
import type { QueueId } from "../domain/types/QueueId.type";
import type { DrizzleMatchSyncRepository } from "../infrastructure/persistence/DrizzleMatchSyncRepository";
import type { DrizzlePlayerMatchRepository } from "../infrastructure/persistence/DrizzlePlayerMatchRepository";
import type {
  matchSyncs,
  playerMatches,
} from "../infrastructure/persistence/match.schema";
import type { RiotMatchAdapter } from "../infrastructure/riot/RiotMatchAdapter";

it("저장소·클라이언트 계약은 큐를 임의의 number가 아닌 QueueId로 받는다", () => {
  expectTypeOf<
    Parameters<PlayerMatchRepository["findByMatchIds"]>[1]
  >().toEqualTypeOf<QueueId>();
  expectTypeOf<
    Parameters<MatchSyncRepository["tryStart"]>[1]
  >().toEqualTypeOf<QueueId>();
  expectTypeOf<
    Parameters<RiotMatchClient["findRecentMatchIds"]>[1]
  >().toEqualTypeOf<QueueId>();
});
it("도메인·서비스·구현체도 계약과 같은 QueueId를 유지한다", () => {
  expectTypeOf<MatchSync["queueId"]>().toEqualTypeOf<QueueId>();
  expectTypeOf<MatchSyncData["queueId"]>().toEqualTypeOf<QueueId>();
  expectTypeOf<
    ConstructorParameters<typeof MatchSync>[1]
  >().toEqualTypeOf<QueueId>();
  expectTypeOf<
    Parameters<MatchCollectionService["collectRecentMatches"]>[1]
  >().toEqualTypeOf<QueueId>();
  expectTypeOf<
    Parameters<DrizzleMatchSyncRepository["tryStart"]>[1]
  >().toEqualTypeOf<QueueId>();
  expectTypeOf<
    Parameters<DrizzlePlayerMatchRepository["findByMatchIds"]>[1]
  >().toEqualTypeOf<QueueId>();
  expectTypeOf<
    Parameters<RiotMatchAdapter["findRecentMatchIds"]>[1]
  >().toEqualTypeOf<QueueId>();
});
it("DB 매핑의 분류 타입도 도메인 타입과 일치한다", () => {
  expectTypeOf<
    (typeof matchSyncs.$inferSelect)["queueId"]
  >().toEqualTypeOf<QueueId>();
  expectTypeOf<
    (typeof playerMatches.$inferSelect)["queueId"]
  >().toEqualTypeOf<QueueId>();
  expectTypeOf<
    NonNullable<(typeof playerMatches.$inferSelect)["position"]>
  >().toEqualTypeOf<Position>();
  expectTypeOf<
    NonNullable<(typeof playerMatches.$inferSelect)["gameMode"]>
  >().toEqualTypeOf<GameMode>();
  expectTypeOf<
    NonNullable<(typeof playerMatches.$inferSelect)["mapId"]>
  >().toEqualTypeOf<MapId>();
});
