/** @description 한 경기의 퍼스트 블러드 획득·도움 여부. 실제 false와 미제공·판별 불가를 구분한다. */
export type FirstBloodObservation =
  | Readonly<{ status: "AVAILABLE"; value: boolean }>
  | Readonly<{ status: "NOT_PROVIDED" }>
  | Readonly<{ status: "UNKNOWN" }>;
