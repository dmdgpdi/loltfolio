import type { PlayerMatch } from "../../domain/PlayerMatch";
import type { Stat } from "../../domain/types/Stat.type";

/** @description SQL 원시 컬럼에는 확보된 값만 넣고, 미제공·판별 불가는 fieldStates에 별도로 저장한다. */
function storedValue<T>(stat: Stat<T>): T | null {
  return stat.status === "AVAILABLE" ? stat.value : null;
}

/** @description 플레이어 경기의 모든 필드 상태를 SQL 저장 값과 상태 맵으로 분리한다. 도메인의 상태를 SQL NULL로만 저장해 의미를 잃지 않도록 한다. */
export function toStoredPlayerMatch(match: PlayerMatch) {
  const values = {
    startedAt: match.startedAt,
    champion: match.champion,
    win: match.win,
    gameId: match.gameId,
    gameVersion: match.gameVersion,
    durationSeconds: match.durationSeconds,
    endOfGameResult: match.endOfGameResult,
    gameEndedInEarlySurrender: match.gameEndedInEarlySurrender,
    gameEndedInSurrender: match.gameEndedInSurrender,
    championId: match.championId,
    summoner1Id: match.summoner1Id,
    summoner2Id: match.summoner2Id,
    position: match.position,
    gameMode: match.gameMode,
    mapId: match.mapId,
  };
  const fieldStates: Record<string, "NOT_PROVIDED" | "UNKNOWN"> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value.status !== "AVAILABLE") fieldStates[key] = value.status;
  }
  return {
    matchId: match.matchId,
    puuid: match.puuid,
    queueId: match.queueId,
    startedAt: storedValue(values.startedAt),
    champion: storedValue(values.champion),
    win: storedValue(values.win),
    gameId: storedValue(values.gameId),
    gameVersion: storedValue(values.gameVersion),
    durationSeconds: storedValue(values.durationSeconds),
    endOfGameResult: storedValue(values.endOfGameResult),
    gameEndedInEarlySurrender: storedValue(values.gameEndedInEarlySurrender),
    gameEndedInSurrender: storedValue(values.gameEndedInSurrender),
    championId: storedValue(values.championId),
    summoner1Id: storedValue(values.summoner1Id),
    summoner2Id: storedValue(values.summoner2Id),
    position: storedValue(values.position),
    gameMode: storedValue(values.gameMode),
    mapId: storedValue(values.mapId),
    fieldStates,
    stats: match.stats,
    laningSnapshots: match.laningSnapshots,
  };
}
