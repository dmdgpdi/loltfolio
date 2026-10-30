/** @description 경기 상태 객체·배열을 재귀적으로 복사하고 동결하여 외부 변경이 저장할 기록에 전파되지 않도록 한다. Date는 이 함수에 넘기기 전에 밀리초로 변환한다. */
export function freezeMatchValue<T>(value: T): T {
  if (Array.isArray(value))
    return Object.freeze(value.map((item) => freezeMatchValue(item))) as T;
  if (value !== null && typeof value === "object") {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          freezeMatchValue(item),
        ]),
      ),
    ) as T;
  }
  return value;
}
