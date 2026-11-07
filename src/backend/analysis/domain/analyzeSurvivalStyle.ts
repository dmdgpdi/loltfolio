import { Result } from "@praha/byethrow";
import { averageAnalysisValues } from "./averageAnalysisValues";
import type { InvalidAnalysisValueError } from "./errors/InvalidAnalysisValueError";
import { summarizeAnalysisCounts } from "./summarizeAnalysisCounts";
import type { AnalysisMetric } from "./types/AnalysisMetric.type";
import type { CountStatistics } from "./types/CountStatistics.type";
import type { MatchFrequency } from "./types/MatchFrequency.type";
import type { SurvivalRecord } from "./types/SurvivalRecord.type";
import type { SurvivalStyle } from "./types/SurvivalStyle.type";

/** @description 사망·위험 상황 생존·최장 생존 시간을 분리하며 실제 0데스만 무데스로 센다. */
export function analyzeSurvivalStyle(
  records: readonly SurvivalRecord[],
): Result.Result<SurvivalStyle, InvalidAnalysisValueError> {
  const deaths = summarizeAnalysisCounts(
    records.map((record) => record.deaths),
  );

  if (Result.isFailure(deaths)) {
    return deaths;
  }

  const singleDigitHpSurvivals = summarizeAnalysisCounts(
    records.map((record) => record.singleDigitHpSurvivals),
  );

  if (Result.isFailure(singleDigitHpSurvivals)) {
    return singleDigitHpSurvivals;
  }

  const largeDamageSurvivals = summarizeAnalysisCounts(
    records.map((record) => record.largeDamageSurvivals),
  );

  if (Result.isFailure(largeDamageSurvivals)) {
    return largeDamageSurvivals;
  }

  const threeImmobilizationSurvivals = summarizeAnalysisCounts(
    records.map((record) => record.threeImmobilizationSurvivals),
  );

  if (Result.isFailure(threeImmobilizationSurvivals)) {
    return threeImmobilizationSurvivals;
  }

  const averageLongestLifeSeconds = averageAnalysisValues(
    records.map((record) => record.longestLifeSeconds),
  );

  if (Result.isFailure(averageLongestLifeSeconds)) {
    return averageLongestLifeSeconds;
  }

  return Result.succeed(
    Object.freeze({
      matchCount: records.length,
      deaths: deaths.value,
      singleDigitHpSurvivals: singleDigitHpSurvivals.value,
      largeDamageSurvivals: largeDamageSurvivals.value,
      threeImmobilizationSurvivals: threeImmobilizationSurvivals.value,
      averageLongestLifeSeconds: averageLongestLifeSeconds.value,
      deathlessMatches: summarizeDeathless(deaths.value),
    }),
  );
}

/** @description 사망 지표의 동일 표본에서 실제 0데스만 세며 미관측을 무데스로 바꾸지 않는다. */
function summarizeDeathless(
  deaths: AnalysisMetric<CountStatistics>,
): MatchFrequency {
  if (deaths.status === "UNAVAILABLE") {
    return deaths;
  }

  const matchedMatchCount =
    deaths.sampleCount - deaths.value.occurredMatchCount;
  return Object.freeze({
    ...deaths,
    value: Object.freeze({
      matchedMatchCount,
      percentage: (matchedMatchCount / deaths.sampleCount) * 100,
    }),
  });
}
