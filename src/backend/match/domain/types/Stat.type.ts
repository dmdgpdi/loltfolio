/** @description 통계 값의 확보 상태. 원본 값이 없으면 NOT_PROVIDED, 계산·판별이 불가능하면 UNKNOWN이며 실제 0·false는 AVAILABLE 값이다. */
export type Stat<T> =
  | Readonly<{ status: "AVAILABLE"; value: T }>
  | Readonly<{ status: "NOT_PROVIDED" }>
  | Readonly<{ status: "UNKNOWN" }>;
