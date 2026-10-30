import type { LaningValues } from "./LaningValues.type";
import type { Stat } from "./Stat.type";

/** @description 경기 10분 또는 15분 근처의 표본 상태. 프레임이 없으면 시각·본인 수치는 NOT_PROVIDED로 남긴다. 상대는 위치 추적 결과가 아닌 동일 teamPosition 기준이다. */
export type LaningSnapshot = Readonly<{
  /** @description 표본의 목표 경기 시점(10분 또는 15분). */
  minute: 10 | 15;
  /** @description 경기 시작 후 실제 표본 시각(밀리초). 목표 시각에서 5초 이내의 가장 가까운 프레임이며 보간하지 않는다. */
  actualTimestampMs: Stat<number>;
  /** @description 이 플레이어의 해당 시점 누적 수치. */
  own: Stat<LaningValues>;
  /** @description 본인에서 상대 팀 동일 포지션 플레이어를 뺀 값. 양수는 본인 우세이며, 상대를 정하지 못하거나 계산이 불가능하면 UNKNOWN이다. */
  opponentDifference: Stat<LaningValues>;
}>;
