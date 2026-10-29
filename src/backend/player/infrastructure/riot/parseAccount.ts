import { Result } from "@praha/byethrow";
import { z } from "zod";
import { PlayerLookupResponseError } from "../../application/errors/PlayerLookupResponseError";
import { Player } from "../../domain/Player";
import { RiotId } from "../../domain/RiotId.VO";

const accountSchema = z.object({
  puuid: z.string().refine((value) => value.trim().length > 0),
  gameName: z.string().optional(),
  tagLine: z.string().optional(),
});

export function parseAccount(
  account: unknown,
  requestedId: RiotId,
): Result.Result<Player, PlayerLookupResponseError> {
  return Result.pipe(
    account,
    Result.parse(accountSchema),
    Result.andThen((dto) =>
      Result.pipe(
        RiotId.create(
          dto.gameName ?? requestedId.name,
          dto.tagLine ?? requestedId.tagLine,
        ),
        Result.map((riotId) => new Player(dto.puuid, riotId)),
      ),
    ),
    Result.mapError((cause) => new PlayerLookupResponseError({ cause })),
  );
}
