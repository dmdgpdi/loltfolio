/** @description 정상 10·15분 프레임 fixture. 프레임·개별 수치를 변경해 표본 미제공과 계산 불가를 검증한다. */
export function createRiotTimelineResponse() {
  const participantFrames = {
    "1": {
      totalGold: 5000,
      xp: 4000,
      level: 9,
      minionsKilled: 80,
      jungleMinionsKilled: 4,
    },
    "6": {
      totalGold: 4500,
      xp: 3800,
      level: 8,
      minionsKilled: 90,
      jungleMinionsKilled: 0,
    },
  };
  return {
    metadata: { matchId: "KR_1" },
    info: {
      frames: [
        { timestamp: 600225, participantFrames },
        { timestamp: 900300, participantFrames },
      ],
    },
  };
}
