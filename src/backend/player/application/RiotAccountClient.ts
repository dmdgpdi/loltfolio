import type { Result } from "@praha/byethrow";
import type { Player } from "@/backend/player/domain/Player";
import type { RiotId } from "@/backend/player/domain/RiotId.VO";
import type { PlayerLookupFailure } from "./errors/PlayerLookupFailure";

export interface RiotAccountClient {
  findByRiotId(
    riotId: RiotId,
  ): Promise<Result.Result<Player | null, PlayerLookupFailure>>;
}
