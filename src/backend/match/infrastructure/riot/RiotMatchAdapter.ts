import { Result } from "@praha/byethrow";
import ky from "ky";
import { z } from "zod";
import { MatchCollectionError } from "../../application/errors/MatchCollectionError";
import type { RiotMatchClient } from "../../application/RiotMatchClient";
import type { QueueId } from "../../domain/types/QueueId.type";
import { parsePlayerMatch } from "./parsePlayerMatch";
import { toMatchCollectionError } from "./toMatchCollectionError";

const configurationSchema = z.object({
  apiKey: z.string().trim().min(1),
  region: z.enum(["ASIA", "AMERICAS", "EUROPE", "SEA"]),
});
type Options = { apiKey?: string; region?: string; fetch?: typeof fetch };

export class RiotMatchAdapter implements RiotMatchClient {
  constructor(private readonly options: Options = {}) {}

  private client() {
    return Result.pipe(
      {
        apiKey: this.options.apiKey ?? process.env.LOL_API_KEY,
        region: this.options.region ?? process.env.LOL_MATCH_REGION ?? "ASIA",
      },
      Result.parse(configurationSchema),
      Result.mapError(
        (cause) => new MatchCollectionError({ cause, reason: "CONFIGURATION" }),
      ),
      Result.map(({ apiKey, region }) =>
        ky.create({
          prefixUrl: `https://${region.toLowerCase()}.api.riotgames.com/lol/match/v5/`,
          headers: { "X-Riot-Token": apiKey },
          retry: 0,
          timeout: 10_000,
          cache: "no-store",
          fetch: this.options.fetch ?? fetch,
        }),
      ),
    );
  }

  /** @description 검증된 QueueId를 Riot 목록 조회의 queue 파라미터로 전달한다. */
  async findRecentMatchIds(
    puuid: string,
    queueId: QueueId,
    count: number,
    start = 0,
  ) {
    return Result.pipe(
      this.client(),
      Result.andThen((client) =>
        Result.try({
          try: () =>
            client
              .get(`matches/by-puuid/${encodeURIComponent(puuid)}/ids`, {
                searchParams: { queue: queueId, start, count },
              })
              .json<unknown>(),
          catch: toMatchCollectionError,
        }),
      ),
      Result.andThen(Result.parse(z.array(z.string().min(1)))),
      Result.mapError((error) =>
        error instanceof MatchCollectionError
          ? error
          : new MatchCollectionError({
              cause: error,
              reason: "INVALID_RESPONSE",
            }),
      ),
    );
  }

  async findPlayerMatch(matchId: string, puuid: string) {
    return Result.pipe(
      this.client(),
      Result.andThen((client) =>
        Result.pipe(
          Result.try({
            try: () =>
              client
                .get(`matches/${encodeURIComponent(matchId)}`)
                .json<unknown>(),
            catch: toMatchCollectionError,
          }),
          Result.andThen((match) =>
            Result.pipe(
              Result.try({
                try: () =>
                  client
                    .get(`matches/${encodeURIComponent(matchId)}/timeline`)
                    .json<unknown>(),
                catch: toMatchCollectionError,
              }),
              Result.andThen((timeline) =>
                parsePlayerMatch(match, timeline, matchId, puuid),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
