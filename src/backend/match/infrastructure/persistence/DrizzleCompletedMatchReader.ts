import { Result } from "@praha/byethrow";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { getDatabase } from "../../../db/client";
import type { CompletedMatchReader } from "../../application/CompletedMatchReader";
import type { CompletedMatchSet } from "../../application/types/CompletedMatchSet.type";
import { MatchRepositoryError } from "../../domain/errors/MatchRepositoryError";
import type { QueueId } from "../../domain/types/QueueId.type";
import { DrizzlePlayerMatchRepository } from "./DrizzlePlayerMatchRepository";
import { matchSyncs } from "./match.schema";

/** @description 완료 상태가 공개한 목록만 읽어 진행·실패 수집의 새 경기와 과거 보충 경기가 섞이는 것을 막는다. */
export class DrizzleCompletedMatchReader implements CompletedMatchReader {
  /** @description 기존 도메인 경기 복원 경계를 재사용하며 DB 연결을 외부에서 주입받는다. */
  constructor(private readonly db: ReturnType<typeof getDatabase>) {}

  /** @description 완료 ID 목록을 고정한 뒤 변경되지 않는 경기 원본을 읽는다. 목록이 없는 과거 성공 기록은 조회 부재다. */
  async findLatest(
    puuid: string,
    queueId: QueueId,
  ): Promise<Result.Result<CompletedMatchSet | null, MatchRepositoryError>> {
    return Result.try({
      try: async () => {
        const [row] = await this.db
          .select()
          .from(matchSyncs)
          .where(
            and(eq(matchSyncs.puuid, puuid), eq(matchSyncs.queueId, queueId)),
          )
          .limit(1);

        if (!row || row.lastCompletedMatchIds === null) {
          return null;
        }

        const ids = z
          .array(z.string().refine((id) => id.trim().length > 0))
          .max(20)
          .refine((ids) => new Set(ids).size === ids.length)
          .parse(row.lastCompletedMatchIds);

        if (row.lastSucceededAt === null) {
          throw new MatchRepositoryError();
        }

        const records = await new DrizzlePlayerMatchRepository(
          this.db,
        ).findByMatchIds(puuid, queueId, ids);

        if (Result.isFailure(records)) {
          throw records.error;
        }

        const byId = new Map(
          records.value.map((match) => [match.matchId, match]),
        );
        const matches = ids.flatMap((id) => {
          const match = byId.get(id);
          return match?.isEligibleForAnalysis() ? [match] : [];
        });
        return Object.freeze({
          selectedMatchIds: Object.freeze(ids),
          matches: Object.freeze(matches),
        });
      },
      catch: (cause) => new MatchRepositoryError({ cause }),
    });
  }
}
