/** @description 정상 Riot 경기 상세 fixture. 테스트는 필요한 원본 필드만 변경하여 누락·오류 상황을 만든다. */
export function createRiotMatchResponse() {
  return {
    metadata: { matchId: "KR_1" },
    info: {
      gameId: 1,
      queueId: 420,
      mapId: 11,
      gameMode: "CLASSIC",
      gameVersion: "16.21",
      gameStartTimestamp: 1_793_000_000_000,
      gameEndTimestamp: 1_793_001_800_000,
      gameDuration: 1800,
      endOfGameResult: "GameComplete",
      participants: [
        {
          puuid: "other",
          participantId: 6,
          teamId: 200,
          teamPosition: "MIDDLE",
          championName: "Other",
        },
        {
          puuid: "target",
          participantId: 1,
          teamId: 100,
          teamPosition: "MIDDLE",
          championId: 103,
          championName: "Ahri",
          win: true,
          summoner1Id: 4,
          summoner2Id: 14,
          gameEndedInEarlySurrender: false,
          gameEndedInSurrender: true,
          kills: 3,
          deaths: 0,
          assists: 5,
          enemyMissingPings: 0,
          challenges: {
            soloKills: 2,
            goldPerMinute: 412.5,
            visionScoreAdvantageLaneOpponent: -0.35,
            maxCsAdvantageOnLaneOpponent: 23.25,
            earlyLaningPhaseGoldExpAdvantage: 1,
          },
        },
      ] satisfies [unknown, unknown],
    },
  };
}
