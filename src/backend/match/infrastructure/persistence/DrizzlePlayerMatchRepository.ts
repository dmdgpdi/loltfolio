import { Result } from "@praha/byethrow";
import { and, eq, inArray } from "drizzle-orm";
import type { getDatabase } from "../../../db/client";
import { MatchRepositoryError } from "../../domain/errors/MatchRepositoryError";
import { PlayerMatch } from "../../domain/PlayerMatch";
import type { PlayerMatchRepository } from "../../domain/types/PlayerMatchRepository.type";
import type { QueueId } from "../../domain/types/QueueId.type";
import { storedPlayerMatchSchema } from "../storedPlayerMatchSchema";
import { playerMatches } from "./match.schema";
import { toStoredPlayerMatch } from "./toStoredPlayerMatch";

/** @description 경기의 원시 SQL 값과 상태 맵을 함께 저장·복원하여 null에 서로 다른 의미가 섞이지 않도록 한다. */
export class DrizzlePlayerMatchRepository implements PlayerMatchRepository {
  /** @description 주입된 DB 연결에서 경기 기록의 조회·저장만 담당한다. */
  constructor(private readonly db: ReturnType<typeof getDatabase>) {}

  /** @description 플레이어·큐·경기 ID에 맞는 저장 기록을 상태 검증 후 도메인 객체로 복원한다. */
  async findByMatchIds(
    puuid: string,
    queueId: QueueId,
    matchIds: readonly string[],
  ) {
    if (matchIds.length === 0) {
      return Result.succeed([]);
    }

    return Result.pipe(
      Result.try({
        try: () =>
          this.db
            .select()
            .from(playerMatches)
            .where(
              and(
                eq(playerMatches.puuid, puuid),
                eq(playerMatches.queueId, queueId),
                inArray(playerMatches.matchId, [...matchIds]),
              ),
            ),
        catch: (cause) => new MatchRepositoryError({ cause }),
      }),
      Result.andThen((rows) => {
        const matches: PlayerMatch[] = [];
        for (const row of rows) {
          const classification = storedPlayerMatchSchema.safeParse(row);
          if (!classification.success)
            return Result.fail(
              new MatchRepositoryError({ cause: classification.error }),
            );
          matches.push(new PlayerMatch({ ...row, ...classification.data }));
        }
        return Result.succeed(matches);
      }),
    );
  }

  /** @description 기록과 상태 맵을 함께 원자적으로 저장하며 기존 경기·플레이어 조합은 덮어쓰지 않는다. */
  async saveAll(matches: readonly PlayerMatch[]) {
    if (matches.length === 0) return Result.succeed(undefined);
    return Result.pipe(
      Result.try({
        try: () =>
          this.db
            .insert(playerMatches)
            .values(matches.map(toStoredPlayerMatch))
            .onConflictDoNothing({
              target: [playerMatches.matchId, playerMatches.puuid],
            }),
        catch: (cause) => new MatchRepositoryError({ cause }),
      }),
      Result.map(() => undefined),
    );
  }
}
