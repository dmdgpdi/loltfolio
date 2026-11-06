/** @description 같은 유효 경기에서 계산한 핑 사용량. 관측이 없으면 계산 불가이며, 관측된 전부 0인 결과와 구분한다. */
export type PingUsage = Readonly<{
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
      }>
    | Readonly<{ status: "UNAVAILABLE" }>
  );
