import { Result } from "@praha/byethrow";
import { expect, it } from "vitest";
import { Player } from "../domain/Player";
import { RiotId } from "../domain/RiotId.VO";
import { PlayerLookupError } from "./errors/PlayerLookupError";
import { PlayerNotFoundError } from "./errors/PlayerNotFoundError";
import { PlayerLookupService } from "./PlayerLookupService";

it("Riot ID에 해당하는 플레이어를 반환한다", async () => {
  const riotId = Result.unwrap(RiotId.create("Hide on bush", "KR1"));
  const player = new Player("example-puuid", riotId);
  const service = new PlayerLookupService({
    findByRiotId: async (requestedId) =>
      Result.succeed(requestedId.equals(riotId) ? player : null),
  });

  const result = await service.findByRiotId(riotId);

  expect(result).toEqual(Result.succeed(player));
});

it("플레이어가 없으면 미발견 오류를 반환한다", async () => {
  const riotId = Result.unwrap(RiotId.create("Hide on bush", "KR1"));
  const service = new PlayerLookupService({
    findByRiotId: async () => Result.succeed(null),
  });

  const result = await service.findByRiotId(riotId);

  expect(result).toEqual(Result.fail(expect.any(PlayerNotFoundError)));
});

it("외부 조회 실패를 원인과 함께 반환한다", async () => {
  const riotId = Result.unwrap(RiotId.create("Hide on bush", "KR1"));
  const error = new PlayerLookupError({
    cause: new Error("Connection failed"),
  });
  const service = new PlayerLookupService({
    findByRiotId: async () => Result.fail(error),
  });

  const result = await service.findByRiotId(riotId);

  expect(result).toEqual(Result.fail(error));
});
