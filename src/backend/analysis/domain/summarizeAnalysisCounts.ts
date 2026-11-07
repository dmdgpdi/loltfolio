import { Result } from "@praha/byethrow";
import { InvalidAnalysisValueError } from "./errors/InvalidAnalysisValueError";
import type { AnalysisMetric } from "./types/AnalysisMetric.type";
import type { AnalysisObservation } from "./types/AnalysisObservation.type";
import type { CountStatistics } from "./types/CountStatistics.type";

/** @description 횟수와 합계의 안전 정수 범위를 검증하고 실제 0과 미확보 표본을 구분해 집계한다. */
export function summarizeAnalysisCounts(
  observations: readonly AnalysisObservation<number>[],
): Result.Result<AnalysisMetric<CountStatistics>, InvalidAnalysisValueError> {
  let sampleCount = 0;
  let notProvidedCount = 0;
  let unknownCount = 0;
  let total = 0;
  let maximum = 0;
  let occurredMatchCount = 0;

  for (const observation of observations) {
    if (observation.status === "NOT_PROVIDED") {
      notProvidedCount += 1;
      continue;
    }

    if (observation.status === "UNKNOWN") {
      unknownCount += 1;
      continue;
    }

    if (
      !Number.isSafeInteger(observation.value) ||
      observation.value < 0 ||
      !Number.isSafeInteger(total + observation.value)
    ) {
      return Result.fail(new InvalidAnalysisValueError());
    }

    sampleCount += 1;
    total += observation.value;
    maximum = Math.max(maximum, observation.value);
    occurredMatchCount += observation.value > 0 ? 1 : 0;
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
