/** @description 첫 포탑 직접 파괴 또는 어시스트의 독립 표본과 발생 비율. 실제 false와 미제공·판별 불가를 구분한다. */
export type FirstTowerOccurrence = Readonly<{
  sampleCount: number;
  notProvidedCount: number;
  unknownCount: number;
}> &
  (
    | Readonly<{
        status: "AVAILABLE";
        occurredMatchCount: number;
        percentage: number;
      }>
    | Readonly<{ status: "UNAVAILABLE" }>
  );
