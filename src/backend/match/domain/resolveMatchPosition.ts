import { GameMode } from "./GameMode";
import { MapId } from "./MapId";
import { Position } from "./Position";
import { QueueId } from "./QueueId";
import type { PlayerMatchData } from "./types/PlayerMatchData.type";
import type { Position as PositionValue } from "./types/Position.type";
import type { Stat } from "./types/Stat.type";

/** @description 칼바람 규칙·맵·큐(격전 포함)로 포지션 미적용이 확정되면 확보된 NONE을 반환한다. 원본 누락과 판별 불가는 서로 다른 상태로 보존한다. */
export function resolveMatchPosition(
  data: Pick<PlayerMatchData, "position" | "queueId" | "gameMode" | "mapId">,
): Stat<PositionValue> {
  return (data.gameMode?.status === "AVAILABLE" &&
    data.gameMode.value === GameMode.ARAM) ||
    (data.mapId?.status === "AVAILABLE" &&
      data.mapId.value === MapId.HOWLING_ABYSS) ||
    data.queueId === QueueId.ARAM ||
    data.queueId === QueueId.ARAM_CLASH
    ? { status: "AVAILABLE", value: Position.NONE }
    : (data.position ?? { status: "NOT_PROVIDED" });
}
