/** @description 구조물 행동의 유효 표본 집계. 0회 경기 수는 확보된 실제 0만 세며 미관측은 포함하지 않는다. */
export type StructureActivity = Readonly<{
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
