/** @description 첫 포탑 관여를 판별한 경기 수와 관여 경기 수. 두 플래그로 결정할 수 없는 경기는 별도 표본으로 남긴다. */
export type FirstTowerParticipation = Readonly<{
  sampleCount: number;
  unresolvedMatchCount: number;
}> &
  (
    | Readonly<{ status: "AVAILABLE"; participatedMatchCount: number }>
    | Readonly<{ status: "UNAVAILABLE" }>
  );
