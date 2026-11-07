/** @description 한 경기의 처치 횟수 관측. 실제 0과 원천 미제공·판별 불가를 구분한다. */
export type KillCount =
  | Readonly<{ status: "AVAILABLE"; value: number }>
  | Readonly<{ status: "NOT_PROVIDED" }>
  | Readonly<{ status: "UNKNOWN" }>;
