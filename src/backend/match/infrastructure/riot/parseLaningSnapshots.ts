import { Result } from "@praha/byethrow";
import { z } from "zod";
import { MatchCollectionError } from "../../application/errors/MatchCollectionError";
import type { LaningSnapshot } from "../../domain/types/LaningSnapshot.type";
import type { LaningValues } from "../../domain/types/LaningValues.type";
import type { Stat } from "../../domain/types/Stat.type";
import { providedStatSchema } from "../providedStatSchema";
import type { LaningSnapshotContext } from "./LaningSnapshotContext.type";

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

/** @description 검증된 Timeline 프레임. 참가자별 원본 값은 필요한 참가자만 별도로 검증한다. */
type TimelineFrame = z.infer<typeof timelineSchema>["info"]["frames"][number];

/** @description 목표 시각에 가장 가까운 프레임을 선택하며 동률이면 원본 순서의 첫 프레임을 유지한다. */
function nearestFrame(
  frames: readonly TimelineFrame[],
  target: number,
): TimelineFrame | undefined {
  return frames.reduce<TimelineFrame | undefined>(
    (nearest, current) =>
      !nearest ||
      Math.abs(current.timestamp - target) <
        Math.abs(nearest.timestamp - target)
        ? current
        : nearest,
    undefined,
  );
}

/** @description 참가자 프레임 누락은 미제공이고 잘못된 필드는 응답 오류다. */
function parseFrame(
  input: unknown,
): Result.Result<Stat<LaningValues>, MatchCollectionError> {
  if (input === undefined || input === null)
    return Result.succeed({ status: "NOT_PROVIDED" });
  const parsed = frameSchema.safeParse(input);
  if (!parsed.success)
    return Result.fail(
      new MatchCollectionError({
        cause: parsed.error,
        reason: "INVALID_RESPONSE",
      }),
    );
  return Result.succeed({ status: "AVAILABLE", value: values(parsed.data) });
}

/** @description 상대 표본이 없으면 비교 불가로 남기고 개별 수치는 양쪽 원값이 확보된 경우만 차이를 계산한다. */
function compareValues(
  own: LaningValues,
  other: Stat<LaningValues>,
): Stat<LaningValues> {
  if (other.status !== "AVAILABLE") return { status: "UNKNOWN" };
  return {
    status: "AVAILABLE",
    value: {
      gold: difference(own.gold, other.value.gold),
      xp: difference(own.xp, other.value.xp),
      level: difference(own.level, other.value.level),
      laneCs: difference(own.laneCs, other.value.laneCs),
      jungleCs: difference(own.jungleCs, other.value.jungleCs),
    },
  };
}

/** @description 한 목표 시점의 표본을 만든다. 본인 프레임이 없으면 상대 프레임 검증을 요구하지 않는다. */
function parseSnapshot(
  frames: readonly TimelineFrame[],
  minute: 10 | 15,
  context: LaningSnapshotContext,
): Result.Result<LaningSnapshot, MatchCollectionError> {
  const missing: LaningSnapshot = {
    minute,
    actualTimestampMs: { status: "NOT_PROVIDED" },
    own: { status: "NOT_PROVIDED" },
    opponentDifference: { status: "UNKNOWN" },
  };
  if (
    context.durationSeconds.status === "AVAILABLE" &&
    context.durationSeconds.value < minute * 60
  )
    return Result.succeed(missing);
  const target = minute * 60_000;
  const frame = nearestFrame(frames, target);
  if (!frame || Math.abs(frame.timestamp - target) > 5_000)
    return Result.succeed(missing);
  const actualTimestampMs = {
    status: "AVAILABLE" as const,
    value: frame.timestamp,
  };
  const own = parseFrame(
    frame.participantFrames[String(context.participantId)],
  );
  if (Result.isFailure(own)) return own;
  if (own.value.status !== "AVAILABLE")
    return Result.succeed({ ...missing, actualTimestampMs });
  const opponentInput =
    context.opponentId === null
      ? undefined
      : frame.participantFrames[String(context.opponentId)];
  const other = parseFrame(opponentInput);
  if (Result.isFailure(other)) return other;
  return Result.succeed({
    minute,
    actualTimestampMs,
    own: own.value,
    opponentDifference: compareValues(own.value.value, other.value),
  });
}

/** @description 10·15분 표본을 항상 반환한다. 목표에서 5초 이내의 실제 프레임만 사용하고 보간하지 않는다. */
export function parseLaningSnapshots(
  body: unknown,
  context: LaningSnapshotContext,
): Result.Result<readonly LaningSnapshot[], MatchCollectionError> {
  const parsed = timelineSchema.safeParse(body);
  if (!parsed.success)
    return Result.fail(
      new MatchCollectionError({
        cause: parsed.error,
        reason: "INVALID_RESPONSE",
      }),
    );
  if (parsed.data.metadata.matchId !== context.matchId)
    return Result.fail(
      new MatchCollectionError({ reason: "INVALID_RESPONSE" }),
    );
  const snapshots: LaningSnapshot[] = [];
  for (const minute of [10, 15] as const) {
    const snapshot = parseSnapshot(parsed.data.info.frames, minute, context);
    if (Result.isFailure(snapshot)) return snapshot;
    snapshots.push(snapshot.value);
  }
  return Result.succeed(snapshots);
}
