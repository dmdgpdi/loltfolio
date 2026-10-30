import { Result } from "@praha/byethrow";
import { z } from "zod";
import { MatchCollectionError } from "../../application/errors/MatchCollectionError";
import type { LaningSnapshot } from "../../domain/types/LaningSnapshot.type";
import type { LaningValues } from "../../domain/types/LaningValues.type";
import type { Stat } from "../../domain/types/Stat.type";
import { providedStatSchema } from "../providedStatSchema";

const frameSchema = z.object({
  totalGold: providedStatSchema(z.number()),
  xp: providedStatSchema(z.number()),
  level: providedStatSchema(z.number()),
  minionsKilled: providedStatSchema(z.number()),
  jungleMinionsKilled: providedStatSchema(z.number()),
});
const timelineSchema = z.object({
  metadata: z.object({ matchId: z.string() }),
  info: z.object({
    frames: z.array(
      z.object({
        timestamp: z.number().nonnegative(),
        participantFrames: z.record(z.string(), z.unknown()),
      }),
    ),
  }),
});

/** @description Timeline 좌표가 아닌 경기 누적 성장 수치와 각 필드의 제공 상태를 도메인 이름으로 옮긴다. */
function values(frame: z.infer<typeof frameSchema>): LaningValues {
  return {
    gold: frame.totalGold,
    xp: frame.xp,
    level: frame.level,
    laneCs: frame.minionsKilled,
    jungleCs: frame.jungleMinionsKilled,
  };
}

/** @description 두 원본 수치가 모두 확보된 경우만 차이를 계산한다. 원본 누락으로 계산할 수 없는 차이는 UNKNOWN이다. */
function difference(own: Stat<number>, other: Stat<number>): Stat<number> {
  return own.status === "AVAILABLE" && other.status === "AVAILABLE"
    ? { status: "AVAILABLE", value: own.value - other.value }
    : { status: "UNKNOWN" };
}

/** @description 10·15분 표본을 항상 반환하며 표본 미제공과 비교 불가를 상태로 남긴다. 목표 시각에서 5초 이내의 실제 프레임만 사용하며 보간하지 않는다. */
export function parseLaningSnapshots(
  body: unknown,
  matchId: string,
  participantId: number,
  opponentId: number | null,
  durationSeconds: Stat<number>,
): Result.Result<readonly LaningSnapshot[], MatchCollectionError> {
  const parsed = timelineSchema.safeParse(body);
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
  const snapshots: LaningSnapshot[] = [];
  for (const minute of [10, 15] as const) {
    const missing: LaningSnapshot = {
      minute,
      actualTimestampMs: { status: "NOT_PROVIDED" },
      own: { status: "NOT_PROVIDED" },
      opponentDifference: { status: "UNKNOWN" },
    };
    if (
      durationSeconds.status === "AVAILABLE" &&
      durationSeconds.value < minute * 60
    ) {
      snapshots.push(missing);
      continue;
    }
    const target = minute * 60_000;
    const frame = parsed.data.info.frames.reduce<
      (typeof parsed.data.info.frames)[number] | undefined
    >(
      (nearest, current) =>
        !nearest ||
        Math.abs(current.timestamp - target) <
          Math.abs(nearest.timestamp - target)
          ? current
          : nearest,
      undefined,
    );
    if (!frame || Math.abs(frame.timestamp - target) > 5_000) {
      snapshots.push(missing);
      continue;
    }
    const ownInput = frame.participantFrames[String(participantId)];
    if (ownInput === undefined || ownInput === null) {
      snapshots.push({
        ...missing,
        actualTimestampMs: { status: "AVAILABLE", value: frame.timestamp },
      });
      continue;
    }
    const ownFrame = frameSchema.safeParse(ownInput);
    if (!ownFrame.success)
      return Result.fail(
        new MatchCollectionError({
          cause: ownFrame.error,
          reason: "INVALID_RESPONSE",
        }),
      );
    const own = values(ownFrame.data);
    const opponentInput =
      opponentId === null
        ? undefined
        : frame.participantFrames[String(opponentId)];
    const opponent =
      opponentInput === undefined || opponentInput === null
        ? undefined
        : frameSchema.safeParse(opponentInput);
    if (opponent && !opponent.success)
      return Result.fail(
        new MatchCollectionError({
          cause: opponent.error,
          reason: "INVALID_RESPONSE",
        }),
      );
    const other = opponent?.success ? values(opponent.data) : undefined;
    snapshots.push({
      minute,
      actualTimestampMs: { status: "AVAILABLE", value: frame.timestamp },
      own: { status: "AVAILABLE", value: own },
      opponentDifference: other
        ? {
            status: "AVAILABLE",
            value: {
              gold: difference(own.gold, other.gold),
              xp: difference(own.xp, other.xp),
              level: difference(own.level, other.level),
              laneCs: difference(own.laneCs, other.laneCs),
              jungleCs: difference(own.jungleCs, other.jungleCs),
            },
          }
        : { status: "UNKNOWN" },
    });
  }
  return Result.succeed(snapshots);
}
