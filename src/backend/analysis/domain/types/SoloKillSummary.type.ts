/** @description 솔로킬을 관측한 경기의 규모와 빈도. 미관측은 실제 0이나 솔로킬 미발생으로 계산하지 않는다. */
export type SoloKillSummary = Readonly<{
  sampleCount: number;
  notProvidedCount: number;
  unknownCount: number;
}> &
  (
    | Readonly<{
        status: "AVAILABLE";
        total: number;
        average: number;
        maximum: number;
        occurredMatchCount: number;
      }>
    | Readonly<{ status: "UNAVAILABLE" }>
  );
