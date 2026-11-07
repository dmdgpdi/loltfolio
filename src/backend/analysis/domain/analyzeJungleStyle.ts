import { Result } from "@praha/byethrow";
import type { InvalidAnalysisPositionError } from "./errors/InvalidAnalysisPositionError";
import { InvalidJungleValueError } from "./errors/InvalidJungleValueError";
import { PositionDistribution } from "./PositionDistribution";
import type { AnalysisMetric } from "./types/AnalysisMetric.type";
import type { CountStatistics } from "./types/CountStatistics.type";
import type { JungleRecord } from "./types/JungleRecord.type";
import type { JungleStyle } from "./types/JungleStyle.type";

/** @description 확보된 정글 경기만 선정하며 역할 미확보와 다른 역할의 활동을 지표 표본에 섞지 않는다. */
export function analyzeJungleStyle(
  records: readonly JungleRecord[],
): Result.Result<
  JungleStyle,
  InvalidAnalysisPositionError | InvalidJungleValueError
> {
  const positions = PositionDistribution.analyze(records);

  if (Result.isFailure(positions)) {
    return positions;
  }

  const jungle = records.filter(
    ({ position }) =>
      position.status === "AVAILABLE" && position.value === "JUNGLE",
  );
  const monster = summarize(jungle, "enemyJungleMonsterKills");

  if (Result.isFailure(monster)) {
    return monster;
  }

  const counts = collectCounts(jungle);

  if (Result.isFailure(counts)) {
    return counts;
  }

  const average: AnalysisMetric<number> =
    monster.value.status === "AVAILABLE"
      ? { ...monster.value, value: monster.value.value.average }
      : monster.value;
  return Result.succeed(
    Object.freeze({
      matchCount: records.length,
      jungleMatchCount: jungle.length,
      averageEnemyJungleMonsterKills: Object.freeze(average),
      ...counts.value,
    }),
  );
}

/** @description 고정된 여섯 횟수 지표를 각각 독립 집계한다. */
function collectCounts(
  records: readonly JungleRecord[],
): Result.Result<
  Omit<
    JungleStyle,
    "matchCount" | "jungleMatchCount" | "averageEnemyJungleMonsterKills"
  >,
  InvalidJungleValueError
> {
  const kinds = [
    "enemyJungleMinionsKilled",
    "scuttleCrabKills",
    "earlyLanerKills",
    "dragonTakedowns",
    "baronTakedowns",
    "buffsStolen",
  ] as const;
  const entries: [(typeof kinds)[number], AnalysisMetric<CountStatistics>][] =
    [];

  for (const kind of kinds) {
    const metric = summarize(records, kind);

    if (Result.isFailure(metric)) {
      return metric;
    }

    entries.push([kind, metric.value]);
  }

  // 고정 목록의 모든 지표를 한 번씩 구성한다.
  return Result.succeed(
    Object.fromEntries(entries) as Record<
      (typeof kinds)[number],
      AnalysisMetric<CountStatistics>
    >,
  );
}

/** @description 한 지표의 관측 상태와 집계 범위를 검증하며 실제 0도 유효 표본에 포함한다. */
function summarize(
  records: readonly JungleRecord[],
  kind: Exclude<keyof JungleRecord, "position">,
): Result.Result<AnalysisMetric<CountStatistics>, InvalidJungleValueError> {
  let sampleCount = 0;
  let notProvidedCount = 0;
  let unknownCount = 0;
  let total = 0;
  let maximum = 0;
  let occurredMatchCount = 0;

  for (const record of records) {
    const observation = record[kind];

    if (observation.status === "NOT_PROVIDED") {
      notProvidedCount += 1;
      continue;
    }

    if (observation.status === "UNKNOWN") {
      unknownCount += 1;
      continue;
    }

    const value = observation.value;

    if (!isValidValue(value, total, kind === "enemyJungleMonsterKills")) {
      return Result.fail(new InvalidJungleValueError());
    }

    sampleCount += 1;
    total += value;
    maximum = Math.max(maximum, value);
    occurredMatchCount += value > 0 ? 1 : 0;
  }

  const coverage = { sampleCount, notProvidedCount, unknownCount };
  return Result.succeed(
    Object.freeze(
      sampleCount === 0
        ? { ...coverage, status: "UNAVAILABLE" }
        : {
            ...coverage,
            status: "AVAILABLE",
            value: Object.freeze({
              total,
              average: total / sampleCount,
              maximum,
              occurredMatchCount,
            }),
          },
    ),
  );
}

/** @description 몬스터 원값은 소수를 허용하고 횟수 지표는 합계도 안전한 정수로 제한한다. */
function isValidValue(
  value: number,
  total: number,
  fractional: boolean,
): boolean {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    Number.isFinite(total + value) &&
    (fractional ||
      (Number.isSafeInteger(value) && Number.isSafeInteger(total + value)))
  );
}
