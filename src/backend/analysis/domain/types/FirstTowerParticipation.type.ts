/** @description 첫 포탑 관여의 유효 표본·발생 수·반올림하지 않은 백분율. 두 플래그로 결정할 수 없는 경기는 별도 표본으로 남긴다. */
export type FirstTowerParticipation = Readonly<{
  sampleCount: number;
  unresolvedMatchCount: number;
}> &
  (
    | Readonly<{
        status: "AVAILABLE";
        participatedMatchCount: number;
        percentage: number;
      }>
    | Readonly<{ status: "UNAVAILABLE" }>
  );
