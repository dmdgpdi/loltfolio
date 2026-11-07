import type { PlayerMatch } from "../../domain/PlayerMatch";

/** @description 마지막 완료 수집의 원래 ID 범위와 그 안에 저장된 분석 가능 경기. 과거 경기로 누락을 채우지 않는다. */
export type CompletedMatchSet = Readonly<{
  selectedMatchIds: readonly string[];
  matches: readonly PlayerMatch[];
}>;
