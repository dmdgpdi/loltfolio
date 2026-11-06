import { expect, it } from "vitest";
import { toProvidedStat } from "./toProvidedStat";

it.each([
  null,
  undefined,
])("원본 값 %s는 알 수 없음이 아닌 미제공이다", (value) => {
  // Arrange: 테스트 인자와 명시한 입력을 사용한다.

  // Act
  const providedStat = toProvidedStat(value);

  // Assert
  expect(providedStat).toEqual({ status: "NOT_PROVIDED" });
});

it.each([
  0,
  false,
  -0.35,
  23.25,
])("실제 값 %s를 확보 상태와 함께 보존한다", (value) => {
  // Arrange: 테스트 인자와 명시한 입력을 사용한다.

  // Act
  const providedStat = toProvidedStat(value);

  // Assert
  expect(providedStat).toEqual({ status: "AVAILABLE", value });
});
