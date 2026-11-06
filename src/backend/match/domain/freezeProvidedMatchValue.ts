import { freezeMatchValue } from "./freezeMatchValue";
import type { Stat } from "./types/Stat.type";

/** @description 기존 입력 호환을 위해 값 누락을 미제공으로 보완하고 참조를 공유하지 않는 불변 상태로 복사한다. */
export function freezeProvidedMatchValue<T>(
  value: Stat<T> | undefined,
): Stat<T> {
  return freezeMatchValue(value ?? { status: "NOT_PROVIDED" });
}
