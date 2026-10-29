import { Result } from "@praha/byethrow";
import { describe, expect, it } from "vitest";
import { Player } from "./Player";
import { RiotId } from "./RiotId.VO";

describe("Player", () => {
  it("플레이어 식별자와 Riot ID를 보유한다", () => {
    const riotId = Result.unwrap(RiotId.create("Hide on bush", "KR1"));
    const player = new Player("example-puuid", riotId);

    expect(player.puuid).toBe("example-puuid");
    expect(player.riotId.equals(riotId)).toBe(true);
  });
});
