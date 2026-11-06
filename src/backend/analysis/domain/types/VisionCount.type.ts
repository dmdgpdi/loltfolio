/** @description 한 경기의 와드 구매·설치·제거 횟수. 실제 0과 미제공·판별 불가를 구분한다. */
export type VisionCount =
  | Readonly<{ status: "AVAILABLE"; value: number }>
  | Readonly<{ status: "NOT_PROVIDED" }>
  | Readonly<{ status: "UNKNOWN" }>;
