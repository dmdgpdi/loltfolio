import { Result } from "@praha/byethrow";
import type { InvalidAnalysisPositionError } from "./errors/InvalidAnalysisPositionError";
import { InvalidComebackRecordError } from "./errors/InvalidComebackRecordError";
import { PositionDistribution } from "./PositionDistribution";
import type { AnalysisMetric } from "./types/AnalysisMetric.type";
import type { AnalysisObservation } from "./types/AnalysisObservation.type";
import type { ComebackRecord } from "./types/ComebackRecord.type";
import type { ComebackStyle } from "./types/ComebackStyle.type";
import type { MatchFrequency } from "./types/MatchFrequency.type";

/** @description 15분 개인 골드 열세와 최종 승리의 조합을 계산하며 팀 역전 기여도로 해석하지 않는다. */
export function analyzeComebackStyle(
  records: readonly ComebackRecord[],
): Result.Result<
  ComebackStyle,
  InvalidAnalysisPositionError | InvalidComebackRecordError
> {
  const positions = PositionDistribution.analyze(records);

  if (Result.isFailure(positions)) {
    return positions;
  }

  const selected = records.filter(
    ({ position }) =>
      position.status === "AVAILABLE" && position.value !== "NONE",
  );

  if (!selected.every(isValidRecord)) {
    return Result.fail(new InvalidComebackRecordError());
  }

  const wins = summarizeWins(selected);

  if (Result.isFailure(wins)) {
    return wins;
  }

  return Result.succeed(
    Object.freeze({
      matchCount: records.length,
      deficitMatchCount: selected.filter(
        ({ goldDifferenceAt15Minutes: gold }) =>
          gold.status === "AVAILABLE" && gold.value < 0,
      ).length,
      deficitWinRate: summarizeWinRate(selected),
      ...wins.value,
    }),
  );
}

/** @description 확보된 값은 조건 비충족 여부와 무관하게 검증해 잘못된 입력을 숨기지 않는다. */
function isValidRecord(record: ComebackRecord): boolean {
  const gold = record.goldDifferenceAt15Minutes;
  return (
    (gold.status !== "AVAILABLE" || Number.isSafeInteger(gold.value)) &&
    (record.win.status !== "AVAILABLE" || typeof record.win.value === "boolean")
  );
}

/** @description 골드 음수가 확정된 경기만 승패 표본으로 쓰고 골드 미확보의 이유는 그대로 보존한다. */
function summarizeWinRate(records: readonly ComebackRecord[]): MatchFrequency {
  let sampleCount = 0;
  let notProvidedCount = 0;
  let unknownCount = 0;
  let matchedMatchCount = 0;

  for (const record of records) {
    const gold = record.goldDifferenceAt15Minutes;

    if (gold.status === "AVAILABLE" && gold.value >= 0) {
      continue;
    }

    const observation = gold.status === "AVAILABLE" ? record.win : gold;

    if (observation.status === "NOT_PROVIDED") {
      notProvidedCount += 1;
    } else if (observation.status === "UNKNOWN") {
      unknownCount += 1;
    } else {
      sampleCount += 1;
      matchedMatchCount += observation.value ? 1 : 0;
    }
  }

  const coverage = { sampleCount, notProvidedCount, unknownCount };
  return Object.freeze(
    sampleCount === 0
      ? { ...coverage, status: "UNAVAILABLE" }
      : {
          ...coverage,
          status: "AVAILABLE",
          value: Object.freeze({
            matchedMatchCount,
            percentage: (matchedMatchCount / sampleCount) * 100,
          }),
        },
  );
}

/** @description 패배 또는 비열세가 확정되면 제외하고 나머지 승리 열세 판별의 미확보 이유를 보존한다. */
function winningDeficit(
  record: ComebackRecord,
): AnalysisObservation<number> | undefined {
  const gold = record.goldDifferenceAt15Minutes;
  const win = record.win;

  if (
    (gold.status === "AVAILABLE" && gold.value >= 0) ||
    (win.status === "AVAILABLE" && !win.value)
  ) {
    return;
  }

  if (gold.status === "UNKNOWN" || win.status === "UNKNOWN") {
    return { status: "UNKNOWN" };
  }

  if (gold.status === "NOT_PROVIDED" || win.status === "NOT_PROVIDED") {
    return { status: "NOT_PROVIDED" };
  }

  return gold;
}

/** @description 열세 후 승리한 공통 표본으로 최대 열세 크기와 부호를 유지한 평균 격차를 계산한다. */
function summarizeWins(
  records: readonly ComebackRecord[],
): Result.Result<
  Pick<ComebackStyle, "largestDeficitInWins" | "averageGoldDifferenceInWins">,
  InvalidComebackRecordError
> {
  let sampleCount = 0;
  let notProvidedCount = 0;
  let unknownCount = 0;
  let total = 0;
  let largest = 0;

  for (const record of records) {
    const observation = winningDeficit(record);

    if (!observation) {
      continue;
    }

    if (observation.status === "NOT_PROVIDED") {
      notProvidedCount += 1;
    } else if (observation.status === "UNKNOWN") {
      unknownCount += 1;
    } else {
      if (!Number.isSafeInteger(total + observation.value)) {
        return Result.fail(new InvalidComebackRecordError());
      }

      sampleCount += 1;
      total += observation.value;
      largest = Math.max(largest, -observation.value);
    }
  }

  const coverage = { sampleCount, notProvidedCount, unknownCount };
  const largestDeficitInWins: AnalysisMetric<number> =
    sampleCount === 0
      ? { ...coverage, status: "UNAVAILABLE" }
      : { ...coverage, status: "AVAILABLE", value: largest };
  const averageGoldDifferenceInWins: AnalysisMetric<number> =
    sampleCount === 0
      ? { ...coverage, status: "UNAVAILABLE" }
      : { ...coverage, status: "AVAILABLE", value: total / sampleCount };
  return Result.succeed({
    largestDeficitInWins: Object.freeze(largestDeficitInWins),
    averageGoldDifferenceInWins: Object.freeze(averageGoldDifferenceInWins),
  });
}
