/** @description 한 경기에서 관측한 구조물 관련 값. 실제 0·false와 미제공·판별 불가를 구분한다. */
export type StructureObservation<T> =
  | Readonly<{ status: "AVAILABLE"; value: T }>
  | Readonly<{ status: "NOT_PROVIDED" }>
  | Readonly<{ status: "UNKNOWN" }>;
