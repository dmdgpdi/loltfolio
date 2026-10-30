import { Result } from "@praha/byethrow";
import { and, eq, isNull, lte, ne, or } from "drizzle-orm";
import type { getDatabase } from "../../../db/client";
import { MatchRepositoryError } from "../../domain/errors/MatchRepositoryError";
import { MatchSyncStartNotAllowedError } from "../../domain/errors/MatchSyncStartNotAllowedError";
import { MATCH_SYNC_SUCCESS_COOLDOWN_MS } from "../../domain/MATCH_SYNC_SUCCESS_COOLDOWN_MS";
import { MatchSync } from "../../domain/MatchSync";
import type { MatchSyncRepository } from "../../domain/types/MatchSyncRepository.type";
import type { QueueId } from "../../domain/types/QueueId.type";
import { matchSyncs } from "./match.schema";

export class DrizzleMatchSyncRepository implements MatchSyncRepository {
  constructor(private readonly db: ReturnType<typeof getDatabase>) {}

  /** @description 플레이어·지원 큐 조합의 시작 조건을 DB에서 원자적으로 확인하고 수집 상태를 반환한다. */
  async tryStart(puuid: string, queueId: QueueId, now: Date) {
    return Result.pipe(
      Result.try({
        try: () =>
          this.db
            .insert(matchSyncs)
            .values({
              puuid,
              queueId,
              status: "IN_PROGRESS",
              lastAttemptAt: now,
            })
            .onConflictDoUpdate({
              target: [matchSyncs.puuid, matchSyncs.queueId],
              set: { status: "IN_PROGRESS", lastAttemptAt: now },
              setWhere: and(
                ne(matchSyncs.status, "IN_PROGRESS"),
                or(
                  isNull(matchSyncs.lastSucceededAt),
                  lte(
                    matchSyncs.lastSucceededAt,
                    new Date(now.getTime() - MATCH_SYNC_SUCCESS_COOLDOWN_MS),
                  ),
                ),
                or(
                  isNull(matchSyncs.retryAvailableAt),
                  lte(matchSyncs.retryAvailableAt, now),
                ),
              ),
            })
            .returning(),
        catch: (cause) => new MatchRepositoryError({ cause }),
      }),
      Result.andThen((rows) =>
        rows[0]
          ? Result.succeed(MatchSync.restore(rows[0]))
          : Result.fail(new MatchSyncStartNotAllowedError()),
      ),
    );
  }

  async update(sync: MatchSync) {
    const lastAttemptAt = sync.lastAttemptAt;
    if (
      !lastAttemptAt ||
      (sync.status !== "SUCCEEDED" &&
        sync.status !== "PARTIALLY_SUCCEEDED" &&
        sync.status !== "FAILED")
    )
      return Result.fail(new MatchRepositoryError());
    return Result.pipe(
      Result.try({
        try: () =>
          this.db
            .update(matchSyncs)
            .set({
              status: sync.status,
              lastSucceededAt: sync.lastSucceededAt,
              retryAvailableAt: sync.retryAvailableAt,
            })
            .where(
              and(
                eq(matchSyncs.puuid, sync.puuid),
                eq(matchSyncs.queueId, sync.queueId),
                eq(matchSyncs.status, "IN_PROGRESS"),
                eq(matchSyncs.lastAttemptAt, lastAttemptAt),
              ),
            )
            .returning({ puuid: matchSyncs.puuid }),
        catch: (cause) => new MatchRepositoryError({ cause }),
      }),
      Result.andThen((rows) =>
        rows.length === 1
          ? Result.succeed(undefined)
          : Result.fail(new MatchRepositoryError()),
      ),
    );
  }
}
