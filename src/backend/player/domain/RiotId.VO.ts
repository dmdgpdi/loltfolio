import { Result } from "@praha/byethrow";
import { PlayerNameRequiredError } from "./errors/PlayerNameRequiredError";
import { TagLineRequiredError } from "./errors/TagLineRequiredError";

export class RiotId {
  private constructor(
    readonly name: string,
    readonly tagLine: string,
  ) {
    Object.freeze(this);
  }

  static create(
    name: string,
    tagLine: string,
  ): Result.Result<RiotId, PlayerNameRequiredError | TagLineRequiredError> {
    if (name.trim().length === 0) {
      return Result.fail(new PlayerNameRequiredError());
    }

    if (tagLine.trim().length === 0) {
      return Result.fail(new TagLineRequiredError());
    }

    return Result.succeed(new RiotId(name, tagLine));
  }

  equals(other: RiotId): boolean {
    return this.name === other.name && this.tagLine === other.tagLine;
  }
}
