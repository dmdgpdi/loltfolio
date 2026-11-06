import { Result } from "@praha/byethrow";
import { describe, expect, it } from "vitest";
import { Player } from "./Player";
import { RiotId } from "./RiotId.VO";

describe("Player", () => {
  it("플레이어 식별자와 Riot ID를 보유한다", () => {
    // Arrange
    const riotId = Result.unwrap(RiotId.create("Hide on bush", "KR1"));

    // Act
    const player = new Player("example-puuid", riotId);

    // Assert
    expect(player.puuid).toBe("example-puuid");

    // Act
    const isEqual = player.riotId.equals(riotId);

    // Assert
    expect(isEqual).toBe(true);
  });
});
