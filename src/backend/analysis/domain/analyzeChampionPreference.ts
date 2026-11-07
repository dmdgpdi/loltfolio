import { Result } from "@praha/byethrow";
import type { InvalidAnalysisPositionError } from "./errors/InvalidAnalysisPositionError";
import { InvalidChampionIdError } from "./errors/InvalidChampionIdError";
import { PositionDistribution } from "./PositionDistribution";
import type { ChampionPreference } from "./types/ChampionPreference.type";
import type { ChampionPreferenceRecord } from "./types/ChampionPreferenceRecord.type";
import type { PreferenceDistribution } from "./types/PreferenceDistribution.type";

/** @description 챔피언과 역할의 전체 빈도 및 공동 최다를 반환하며 스펠 취향은 계산하지 않는다. */
export function analyzeChampionPreference(
  records: readonly ChampionPreferenceRecord[],
): Result.Result<
  ChampionPreference,
  InvalidAnalysisPositionError | InvalidChampionIdError
> {
  const positions = PositionDistribution.analyze(records);

  if (Result.isFailure(positions)) {
    return positions;
  }

  const champions = summarizeChampions(records);

  if (Result.isFailure(champions)) {
    return champions;
  }

  const roleOrder = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
  // 안정 정렬로 동률 역할은 고정된 역할 순서를 유지한다.
  const positionFrequencies = Object.freeze(
    roleOrder
      .map((value) =>
        Object.freeze({ value, matchCount: positions.value.byPosition[value] }),
      )
      .filter(({ matchCount }) => matchCount > 0)
      .sort((left, right) => right.matchCount - left.matchCount),
  );
  return Result.succeed(
    Object.freeze({
      matchCount: records.length,
      champions: champions.value,
      mostPlayedChampions: mostPlayed(
        champions.value.status === "AVAILABLE" ? champions.value.value : [],
      ),
      positions: positions.value,
      positionFrequencies,
      mostPlayedPositions: mostPlayed(positionFrequencies),
    }),
  );
}

/** @description 모든 챔피언 빈도를 횟수 내림차순·ID 오름차순으로 보존하며 미확보를 0번 챔피언으로 만들지 않는다. */
function summarizeChampions(
  records: readonly ChampionPreferenceRecord[],
): Result.Result<PreferenceDistribution<number>, InvalidChampionIdError> {
  const frequencies = new Map<number, number>();
  let notProvidedCount = 0;
  let unknownCount = 0;

  for (const { championId } of records) {
    if (championId.status === "NOT_PROVIDED") {
      notProvidedCount += 1;
      continue;
    }

    if (championId.status === "UNKNOWN") {
      unknownCount += 1;
      continue;
    }

    if (!Number.isSafeInteger(championId.value) || championId.value <= 0) {
      return Result.fail(new InvalidChampionIdError());
    }

    frequencies.set(
      championId.value,
      (frequencies.get(championId.value) ?? 0) + 1,
    );
  }

  const sampleCount = records.length - notProvidedCount - unknownCount;
  const coverage = { sampleCount, notProvidedCount, unknownCount };
  const value = Object.freeze(
    [...frequencies]
      .map(([value, matchCount]) => Object.freeze({ value, matchCount }))
      .sort(
        (left, right) =>
          right.matchCount - left.matchCount || left.value - right.value,
      ),
  );
  return Result.succeed(
    Object.freeze(
      sampleCount === 0
        ? { ...coverage, status: "UNAVAILABLE" }
        : { ...coverage, status: "AVAILABLE", value },
    ),
  );
}

/** @description 정렬된 전체 빈도에서 최다와 같은 횟수의 항목을 모두 반환하며 빈 목록에는 최다를 만들지 않는다. */
function mostPlayed<T>(
  frequencies: readonly Readonly<{ value: T; matchCount: number }>[],
): readonly T[] {
  const maximum = frequencies[0]?.matchCount;
  return Object.freeze(
    frequencies
      .filter(({ matchCount }) => matchCount === maximum)
      .map(({ value }) => value),
  );
}
