/** @description 두 관측의 OR로 판별한 첫 킬 관여와 유효 분모. 결정 불가능한 경기는 미관여에 포함하지 않는다. */
export type FirstBloodParticipation = Readonly<{
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
