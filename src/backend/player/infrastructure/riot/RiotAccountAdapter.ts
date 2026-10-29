import { Result } from "@praha/byethrow";
import ky from "ky";
import { z } from "zod";
import { PlayerLookupConfigurationError } from "../../application/errors/PlayerLookupConfigurationError";
import type { PlayerLookupFailure } from "../../application/errors/PlayerLookupFailure";
import { PlayerNotFoundError } from "../../application/errors/PlayerNotFoundError";
import type { RiotAccountClient } from "../../application/RiotAccountClient";
import type { Player } from "../../domain/Player";
import type { RiotId } from "../../domain/RiotId.VO";
import { parseAccount } from "./parseAccount";
import { toPlayerLookupFailure } from "./toPlayerLookupFailure";

const hosts = {
  ASIA: "asia.api.riotgames.com",
  AMERICAS: "americas.api.riotgames.com",
  EUROPE: "europe.api.riotgames.com",
} as const;

const configurationSchema = z.object({
  apiKey: z.string().refine((value) => value.trim().length > 0),
  region: z.enum(["ASIA", "AMERICAS", "EUROPE"]),
});

type Options = {
  apiKey?: string;
  region?: string;
  fetch?: typeof fetch;
};

export class RiotAccountAdapter implements RiotAccountClient {
  constructor(private readonly options: Options = {}) {}

  async findByRiotId(
    riotId: RiotId,
  ): Promise<Result.Result<Player | null, PlayerLookupFailure>> {
    const configuration = configurationSchema.safeParse({
      apiKey: this.options.apiKey ?? process.env.LOL_API_KEY,
      region: this.options.region ?? process.env.LOL_ACCOUNT_REGION ?? "ASIA",
    });

    if (!configuration.success) {
      return Result.fail(
        new PlayerLookupConfigurationError({ cause: configuration.error }),
      );
    }

    const { apiKey, region } = configuration.data;
    const client = ky.create({
      prefixUrl: `https://${hosts[region]}/riot/account/v1/`,
      headers: { "X-Riot-Token": apiKey },
      cache: "no-store",
      timeout: 10_000,
      retry: 0,
      fetch: this.options.fetch ?? fetch,
    });

    return Result.pipe(
      Result.try({
        try: () =>
          client
            .get(
              `accounts/by-riot-id/${encodeURIComponent(riotId.name)}/${encodeURIComponent(riotId.tagLine)}`,
            )
            .json<unknown>(),
        catch: toPlayerLookupFailure,
      }),
      Result.andThen((account) => parseAccount(account, riotId)),
      Result.orElse((error) =>
        error instanceof PlayerNotFoundError
          ? Result.succeed(null)
          : Result.fail(error),
      ),
    );
  }
}
