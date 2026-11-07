import { Result } from "@praha/byethrow";
import { InvalidAnalysisPositionError } from "./errors/InvalidAnalysisPositionError";
import type { PositionDistribution as Distribution } from "./types/PositionDistribution.type";
import type { PositionRecord } from "./types/PositionRecord.type";

/** @description 포지션 없음과 관측 누락을 구분하는 불변 역할 분포다. 경기 선정이나 역할 추정은 수행하지 않는다. */
export class PositionDistribution implements Distribution {
  /** @description 집계한 역할별 경기 수와 결과를 동결해 외부 변경을 막는다. */
  private constructor(
    readonly matchCount: number,
    readonly byPosition: Distribution["byPosition"],
    readonly notProvidedMatchCount: number,
    readonly unknownMatchCount: number,
  ) {
    Object.freeze(byPosition);
    Object.freeze(this);
  }

  /** @description 확보된 여섯 역할만 집계하며 잘못된 값은 미제공으로 숨기지 않는다. 모든 분류의 합은 전체 경기 수다. */
  static analyze(
    records: readonly PositionRecord[],
  ): Result.Result<PositionDistribution, InvalidAnalysisPositionError> {
    const byPosition = {
      TOP: 0,
      JUNGLE: 0,
      MIDDLE: 0,
      BOTTOM: 0,
      UTILITY: 0,
      NONE: 0,
    };
    let notProvidedMatchCount = 0;
    let unknownMatchCount = 0;

    for (const { position } of records) {
      if (position.status === "NOT_PROVIDED") {
        notProvidedMatchCount += 1;
        continue;
      }

      if (position.status === "UNKNOWN") {
        unknownMatchCount += 1;
        continue;
      }

      if (
        typeof position.value !== "string" ||
        !Object.hasOwn(byPosition, position.value)
      ) {
        return Result.fail(new InvalidAnalysisPositionError());
      }

      byPosition[position.value] += 1;
    }

    return Result.succeed(
      new PositionDistribution(
        records.length,
        byPosition,
        notProvidedMatchCount,
        unknownMatchCount,
      ),
    );
  }
}
