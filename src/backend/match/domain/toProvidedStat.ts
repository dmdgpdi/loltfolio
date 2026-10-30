import type { Stat } from "./types/Stat.type";

/** @description 외부 원본의 값을 상태와 함께 보존한다. 누락과 명시적 null은 모두 미제공이며 계산·판별 불가 상태를 추정하지 않는다. */
export function toProvidedStat<T>(value: T | null | undefined): Stat<T> {
  return value === null || value === undefined
    ? { status: "NOT_PROVIDED" }
    : { status: "AVAILABLE", value };
}
