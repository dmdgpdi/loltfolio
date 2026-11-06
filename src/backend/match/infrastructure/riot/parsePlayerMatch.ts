import { Result } from "@praha/byethrow";
import { z } from "zod";
import { MatchCollectionError } from "../../application/errors/MatchCollectionError";
import { PlayerMatch } from "../../domain/PlayerMatch";
import { Position } from "../../domain/Position";
import { resolveMatchPosition } from "../../domain/resolveMatchPosition";
import type { PlayerMatchData } from "../../domain/types/PlayerMatchData.type";
import { playerMatchClassificationSchema } from "../playerMatchClassificationSchema";
import { providedStatSchema } from "../providedStatSchema";
import { parseLaningSnapshots } from "./parseLaningSnapshots";
import { participantSchema } from "./participantSchema";
import type { SelectedParticipant } from "./SelectedParticipant.type";
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

  if (!parsed.success) {
    return Result.fail(
      new MatchCollectionError({
        cause: parsed.error,
        reason: "INVALID_RESPONSE",
      }),
    );
  }

  if (parsed.data.metadata.matchId !== matchId) {
    return Result.fail(
      new MatchCollectionError({ reason: "INVALID_RESPONSE" }),
    );
  }

  const info = parsed.data.info;
  const participant = selectParticipant(info.participants, puuid);

  if (Result.isFailure(participant)) {
    return participant;
  }

  const own = participant.value;
  const position = resolveMatchPosition({
    ...info,
    position: own.teamPosition,
  });
  const opponentId = selectOpponentId(info.participants, own, position);
  const durationSeconds = resolveDurationSeconds(info);
  return Result.pipe(
    parseLaningSnapshots(timeline, {
      matchId,
      participantId: own.participantId,
      opponentId,
      durationSeconds,
    }),
    Result.map((laningSnapshots) =>
      assemblePlayerMatch({
        matchId,
        puuid,
        info,
        own,
        position,
        durationSeconds,
        laningSnapshots,
      }),
    ),
  );
}

/** @description 확보된 같은 포지션의 유일한 상대만 선택하며 포지션 없음·미확보는 비교하지 않는다. */
function selectOpponentId(
  participants: readonly unknown[],
  own: SelectedParticipant,
  position: PlayerMatchData["position"],
): number | null {
  const opponents = participants.flatMap((value) => {
    const role = roleSchema.safeParse(value);
    return role.success &&
      role.data.teamId !== own.teamId &&
      position.status === "AVAILABLE" &&
      role.data.teamPosition === position.value &&
      position.value !== Position.NONE
      ? [role.data]
      : [];
  });
  return opponents.length === 1 ? opponents[0].participantId : null;
}

/** @description 검증된 경기·참가자 정보와 시간 표본을 조립하는 입력이다. */
type PlayerMatchAssembly = Pick<
  PlayerMatchData,
  "matchId" | "puuid" | "position" | "durationSeconds" | "laningSnapshots"
> &
  Readonly<{
    info: z.infer<typeof matchSchema>["info"];
    own: SelectedParticipant;
  }>;

/** @description 응답 검증 이후 도메인 값으로 조립하며 시작 시각의 제공 상태를 보존한다. */
function assemblePlayerMatch(input: PlayerMatchAssembly): PlayerMatch {
  const {
    matchId,
    puuid,
    info,
    own,
    position,
    durationSeconds,
    laningSnapshots,
  } = input;
  return new PlayerMatch({
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
  });
}

/** @description PUUID가 일치하는 참가자가 정확히 한 명일 때만 선택하여 필수 수치와 분류를 검증한다. */
function selectParticipant(
  participants: readonly unknown[],
  puuid: string,
): Result.Result<SelectedParticipant, MatchCollectionError> {
  const targets = participants.filter((value) => {
    const id = identitySchema.safeParse(value);
    return id.success && id.data.puuid === puuid;
  });

  if (targets.length !== 1) {
    return Result.fail(
      new MatchCollectionError({ reason: "INVALID_RESPONSE" }),
    );
  }

  const participant = participantSchema.safeParse(targets[0]);

  if (!participant.success) {
    return Result.fail(
      new MatchCollectionError({
        cause: participant.error,
        reason: "INVALID_RESPONSE",
      }),
    );
  }

  return Result.succeed(participant.data);
}

/** @description 종료 타임스탬프가 없는 구버전 응답의 밀리초 경기 시간을 초로 변환하고 미제공 상태를 유지한다. */
function resolveDurationSeconds(
  info: z.infer<typeof matchSchema>["info"],
): PlayerMatchData["durationSeconds"] {
  return info.gameDuration.status === "AVAILABLE"
    ? {
        status: "AVAILABLE" as const,
        value:
          info.gameEndTimestamp === undefined
            ? Math.floor(info.gameDuration.value / 1000)
            : info.gameDuration.value,
      }
    : info.gameDuration;
}
