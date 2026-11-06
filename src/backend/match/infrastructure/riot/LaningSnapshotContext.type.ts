import type { Stat } from "../../domain/types/Stat.type";

/** @description Timeline 표본 추출에 필요한 경기·참가자 식별 정보와 확보된 경기 시간이다. */
export type LaningSnapshotContext = Readonly<{
  matchId: string;
  participantId: number;
  opponentId: number | null;
  durationSeconds: Stat<number>;
}>;
