import { emptyPlayerMatchStats } from "../domain/emptyPlayerMatchStats";
import type { PlayerMatchData } from "../domain/types/PlayerMatchData.type";

/** @description 도메인 테스트의 완전한 정상 경기 fixture. 테스트마다 필요한 필드 상태만 덮어써 경계 조건을 표현한다. */
export function createPlayerMatchData(
  overrides: Partial<PlayerMatchData> = {},
): PlayerMatchData {
  return {
    matchId: "KR_1",
    puuid: "player",
    queueId: 420,
    startedAt: { status: "AVAILABLE", value: new Date(0) },
    champion: { status: "AVAILABLE", value: "Ahri" },
    position: { status: "AVAILABLE", value: "MIDDLE" },
    win: { status: "AVAILABLE", value: true },
    gameId: { status: "AVAILABLE", value: 1 },
    gameMode: { status: "AVAILABLE", value: "CLASSIC" },
    mapId: { status: "AVAILABLE", value: 11 },
    gameVersion: { status: "AVAILABLE", value: "16.21" },
    durationSeconds: { status: "AVAILABLE", value: 1800 },
    endOfGameResult: { status: "AVAILABLE", value: "GameComplete" },
    gameEndedInEarlySurrender: { status: "AVAILABLE", value: false },
    gameEndedInSurrender: { status: "AVAILABLE", value: false },
    championId: { status: "AVAILABLE", value: 103 },
    summoner1Id: { status: "AVAILABLE", value: 4 },
    summoner2Id: { status: "AVAILABLE", value: 14 },
    stats: emptyPlayerMatchStats(),
    laningSnapshots: [10, 15].map((minute) => ({
      minute: minute as 10 | 15,
      actualTimestampMs: { status: "NOT_PROVIDED" },
      own: { status: "NOT_PROVIDED" },
      opponentDifference: { status: "UNKNOWN" },
    })),
    ...overrides,
  };
}
