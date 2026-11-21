import { z } from "zod";
import { GameMode } from "@/backend/match/domain/GameMode";
import { MapId } from "@/backend/match/domain/MapId";
import { Position } from "@/backend/match/domain/Position";
import { QueueId } from "@/backend/match/domain/QueueId";
import { classifiedStatSchema } from "./classifiedStatSchema";

/** @description 큐는 수집 식별 키로 검증하고, 나머지 분류는 원본 누락과 판별 불가를 구분한다. */
export const playerMatchClassificationSchema = z.object({
  queueId: z.literal(Object.values(QueueId)),
  gameMode: classifiedStatSchema(Object.values(GameMode)),
  mapId: classifiedStatSchema(Object.values(MapId)),
  position: classifiedStatSchema(Object.values(Position)),
});
