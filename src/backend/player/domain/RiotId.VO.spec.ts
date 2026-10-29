import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { PlayerNameRequiredError } from "./errors/PlayerNameRequiredError";
import { TagLineRequiredError } from "./errors/TagLineRequiredError";
import { RiotId } from "./RiotId.VO";

it.each([
  "",
  " ",
  "   ",
  "\t\n",
])("플레이어 이름이 빈 문자열 또는 공백(%j)이면 생성할 수 없다", (name) => {
  const result = RiotId.create(name, "KR1");

  expect(result).toEqual(Result.fail(expect.any(PlayerNameRequiredError)));
});

it("유효한 태그라인이면 성공 결과로 생성한다", () => {
  const result = RiotId.create("Hide on bush", "KR1");
  const riotId = Result.unwrap(result);

  expect(Result.isSuccess(result)).toBe(true);
  expect(riotId.name).toBe("Hide on bush");
  expect(riotId.tagLine).toBe("KR1");
});

it.each([
  "",
  " ",
  "   ",
  "\t\n",
])("태그라인이 빈 문자열 또는 공백(%j)이면 생성할 수 없다", (tagLine) => {
  const result = RiotId.create("Hide on bush", tagLine);

  expect(result).toEqual(Result.fail(expect.any(TagLineRequiredError)));
});

it("이름과 태그가 모두 같으면 같은 값으로 판단한다", () => {
  const riotId = Result.unwrap(RiotId.create("Hide on bush", "KR1"));

  expect(
    riotId.equals(Result.unwrap(RiotId.create("Hide on bush", "KR1"))),
  ).toBe(true);
  expect(
    riotId.equals(Result.unwrap(RiotId.create("Other player", "KR1"))),
  ).toBe(false);
  expect(
    riotId.equals(Result.unwrap(RiotId.create("Hide on bush", "KR2"))),
  ).toBe(false);
});

it("생성한 값은 런타임에서도 변경할 수 없다", () => {
  const riotId = Result.unwrap(RiotId.create("Hide on bush", "KR1"));

  expect(Reflect.set(riotId, "name", "Other player")).toBe(false);
  expect(Reflect.set(riotId, "tagLine", "KR2")).toBe(false);
  expect(riotId.name).toBe("Hide on bush");
  expect(riotId.tagLine).toBe("KR1");
});
