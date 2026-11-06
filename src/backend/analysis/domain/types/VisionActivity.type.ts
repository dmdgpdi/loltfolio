/** @description 관측이 확보된 경기의 시야 행동 집계. 기록 없음과 미관측을 구분하며 0회 경기 수도 같은 표본에서 센다. */
export type VisionActivity = Readonly<{
  sampleCount: number;
  notProvidedCount: number;
  unknownCount: number;
}> &
  (
    | Readonly<{
        status: "AVAILABLE";
        total: number;
        average: number;
        zeroMatchCount: number;
      }>
    | Readonly<{ status: "UNAVAILABLE" }>
  );
