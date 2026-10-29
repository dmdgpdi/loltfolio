import type { RiotId } from "./RiotId.VO";

export class Player {
  constructor(
    readonly puuid: string,
    private readonly currentRiotId: RiotId,
  ) {}

  get riotId(): RiotId {
    return this.currentRiotId;
  }
}
