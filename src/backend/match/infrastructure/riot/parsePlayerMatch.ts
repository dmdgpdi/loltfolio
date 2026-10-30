import { Result } from "@praha/byethrow";
import { z } from "zod";
import { MatchCollectionError } from "../../application/errors/MatchCollectionError";
import { PlayerMatch } from "../../domain/PlayerMatch";
import { Position } from "../../domain/Position";
import { resolveMatchPosition } from "../../domain/resolveMatchPosition";
import { playerMatchClassificationSchema } from "../playerMatchClassificationSchema";
import { providedStatSchema } from "../providedStatSchema";
import { parseLaningSnapshots } from "./parseLaningSnapshots";
import { participantSchema } from "./participantSchema";
import { toPlayerMatchStats } from "./toPlayerMatchStats";

const matchSchema = z.object({
  metadata: z.object({ matchId: z.string().min(1) }),
  info: z.object({
    gameId: providedStatSchema(z.int()),
    queueId: playerMatchClassificationSchema.shape.queueId,
    mapId: playerMatchClassificationSchema.shape.mapId,
    gameMode: playerMatchClassificationSchema.shape.gameMode,
    gameVersion: providedStatSchema(z.string()),
    gameStartTimestamp: providedStatSchema(
      z.int().refine((value) => !Number.isNaN(new Date(value).getTime())),
    ),
    gameDuration: providedStatSchema(z.number().nonnegative()),
    gameEndTimestamp: z
      .number()
      .nullish()
      .transform((value) => value ?? undefined),
    endOfGameResult: providedStatSchema(z.string()),
    participants: z.array(z.unknown()),
  }),
});
const identitySchema = z.object({ puuid: z.string().min(1) });
const roleSchema = z.object({
  participantId: z.int(),
  teamId: z.int(),
  teamPosition: z.string(),
});

/** @description 식별 키를 검증한 뒤 모든 경기 값의 제공 상태와 시간별 표본을 도메인 기록으로 변환한다. 잘못된 자료형은 미제공으로 숨기지 않는다. */
export function parsePlayerMatch(
  body: unknown,
  timeline: unknown,
  matchId: string,
  puuid: string,
): Result.Result<PlayerMatch, MatchCollectionError> {
  const parsed = matchSchema.safeParse(body);
  if (!parsed.success)
    return Result.fail(
      new MatchCollectionError({
        cause: parsed.error,
        reason: "INVALID_RESPONSE",
      }),
    );
  if (parsed.data.metadata.matchId !== matchId)
    return Result.fail(
      new MatchCollectionError({ reason: "INVALID_RESPONSE" }),
    );
  const info = parsed.data.info;
  const targets = info.participants.filter((value) => {
    const id = identitySchema.safeParse(value);
    return id.success && id.data.puuid === puuid;
  });
  if (targets.length !== 1)
    return Result.fail(
      new MatchCollectionError({ reason: "INVALID_RESPONSE" }),
    );
  const participant = participantSchema.safeParse(targets[0]);
  if (!participant.success)
    return Result.fail(
      new MatchCollectionError({
        cause: participant.error,
        reason: "INVALID_RESPONSE",
      }),
    );
  const own = participant.data;
  const position = resolveMatchPosition({
    ...info,
    position: own.teamPosition,
  });
  const opponents = info.participants.flatMap((value) => {
    const role = roleSchema.safeParse(value);
    return role.success &&
      role.data.teamId !== own.teamId &&
      position.status === "AVAILABLE" &&
      role.data.teamPosition === position.value &&
      position.value !== Position.NONE
      ? [role.data]
      : [];
  });
  const durationSeconds =
    info.gameDuration.status === "AVAILABLE"
      ? {
          status: "AVAILABLE" as const,
          value:
            info.gameEndTimestamp === undefined
              ? Math.floor(info.gameDuration.value / 1000)
              : info.gameDuration.value,
        }
      : info.gameDuration;
  return Result.pipe(
    parseLaningSnapshots(
      timeline,
      matchId,
      own.participantId,
      opponents.length === 1 ? opponents[0].participantId : null,
      durationSeconds,
    ),
    Result.map(
      (laningSnapshots) =>
        new PlayerMatch({
          matchId,
          puuid,
          queueId: info.queueId,
          startedAt:
            info.gameStartTimestamp.status === "AVAILABLE"
              ? {
                  status: "AVAILABLE",
                  value: new Date(info.gameStartTimestamp.value),
                }
              : info.gameStartTimestamp,
          gameId: info.gameId,
          gameMode: info.gameMode,
          mapId: info.mapId,
          gameVersion: info.gameVersion,
          durationSeconds,
          endOfGameResult: info.endOfGameResult,
          gameEndedInEarlySurrender: own.gameEndedInEarlySurrender,
          gameEndedInSurrender: own.gameEndedInSurrender,
          championId: own.championId,
          champion: own.championName,
          position,
          win: own.win,
          summoner1Id: own.summoner1Id,
          summoner2Id: own.summoner2Id,
          stats: toPlayerMatchStats(own),
          laningSnapshots,
        }),
    ),
  );
}
