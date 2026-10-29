import { Result } from "@praha/byethrow";
import type { Player } from "../domain/Player";
import type { RiotId } from "../domain/RiotId.VO";
import type { PlayerLookupFailure } from "./errors/PlayerLookupFailure";
import { PlayerNotFoundError } from "./errors/PlayerNotFoundError";
import type { RiotAccountClient } from "./RiotAccountClient";

export class PlayerLookupService {
  constructor(private readonly riotAccountClient: RiotAccountClient) {}

  findByRiotId(
    riotId: RiotId,
  ): Promise<Result.Result<Player, PlayerLookupFailure | PlayerNotFoundError>> {
    return Result.pipe(
      this.riotAccountClient.findByRiotId(riotId),
      Result.andThen((player) =>
        player === null
          ? Result.fail(new PlayerNotFoundError())
          : Result.succeed(player),
      ),
    );
  }
}
