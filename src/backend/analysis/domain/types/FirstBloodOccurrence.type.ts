/** @description 직접 획득 또는 어시스트의 독립 표본과 발생 비율. 비율은 반올림하지 않은 백분율이다. */
export type FirstBloodOccurrence = Readonly<{
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
