import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { PlayerNameRequiredError } from "./errors/PlayerNameRequiredError";
import { TagLineRequiredError } from "./errors/TagLineRequiredError";
import { RiotId } from "./RiotId.VO";

it("이름과 태그라인으로 Riot ID를 생성한다", () => {
  // Arrange
  const name = "Hide on bush";
  const tagLine = "KR1";

  // Act
  const result = RiotId.create(name, tagLine);
  const riotId = Result.unwrap(result);

  // Assert
  expect(Result.isSuccess(result)).toBe(true);
  expect(riotId.name).toBe("Hide on bush");
  expect(riotId.tagLine).toBe("KR1");
});

it.each([
  { name: "Hide on bush", tagLine: "KR1", expected: true },
  { name: "Other player", tagLine: "KR1", expected: false },
  { name: "Hide on bush", tagLine: "KR2", expected: false },
])("이름 $name·태그 $tagLine의 동등 비교 결과는 $expected 이다", ({
  name,
  tagLine,
  expected,
}) => {
  // Arrange
  const riotId = Result.unwrap(RiotId.create("Hide on bush", "KR1"));

  // Act
  const isEqual = riotId.equals(Result.unwrap(RiotId.create(name, tagLine)));

  // Assert
  expect(isEqual).toBe(expected);
});

it("생성한 값은 런타임에서도 변경할 수 없다", () => {
  // Arrange
  const riotId = Result.unwrap(RiotId.create("Hide on bush", "KR1"));

  // Act
  const nameChanged = Reflect.set(riotId, "name", "Other player");
  const tagLineChanged = Reflect.set(riotId, "tagLine", "KR2");

  // Assert
  expect(nameChanged).toBe(false);
  expect(tagLineChanged).toBe(false);
  expect(riotId.name).toBe("Hide on bush");
  expect(riotId.tagLine).toBe("KR1");
});

it.each([
  "",
  " ",
  "   ",
  "\t\n",
])("플레이어 이름이 빈 문자열 또는 공백(%j)이면 생성할 수 없다", (name) => {
  // Arrange: 테스트 인자와 명시한 입력을 사용한다.

  // Act
  const result = RiotId.create(name, "KR1");

  // Assert
  expect(result).toEqual(Result.fail(expect.any(PlayerNameRequiredError)));
});

it.each([
  "",
  " ",
  "   ",
  "\t\n",
])("태그라인이 빈 문자열 또는 공백(%j)이면 생성할 수 없다", (tagLine) => {
  // Arrange: 테스트 인자와 명시한 입력을 사용한다.

  // Act
  const result = RiotId.create("Hide on bush", tagLine);

  // Assert
  expect(result).toEqual(Result.fail(expect.any(TagLineRequiredError)));
});
