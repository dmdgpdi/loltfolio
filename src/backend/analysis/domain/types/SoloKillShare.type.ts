/** @description 공통 표본의 전체 킬 중 솔로킬 비중. 유효 표본 없음과 전체 킬 0을 구분하며 백분율은 반올림하지 않는다. */
export type SoloKillShare = Readonly<{
  sampleCount: number;
  excludedMatchCount: number;
}> &
  (
    | Readonly<{
        status: "AVAILABLE";
        soloKillTotal: number;
        killTotal: number;
        percentage: number;
      }>
    | Readonly<{
        status: "UNAVAILABLE";
        reason: "NO_VALID_SAMPLES" | "NO_KILLS";
      }>
  );
