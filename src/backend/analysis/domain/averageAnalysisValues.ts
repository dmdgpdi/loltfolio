import { Result } from "@praha/byethrow";
import { InvalidAnalysisValueError } from "./errors/InvalidAnalysisValueError";
import type { AnalysisMetric } from "./types/AnalysisMetric.type";
import type { AnalysisObservation } from "./types/AnalysisObservation.type";

/** @description 양·시간의 유한한 비음수와 합계를 검증하고 지표별 유효 표본에서만 평균한다. 소수 원값을 허용한다. */
export function averageAnalysisValues(
  observations: readonly AnalysisObservation<number>[],
): Result.Result<AnalysisMetric<number>, InvalidAnalysisValueError> {
  let sampleCount = 0;
  let notProvidedCount = 0;
  let unknownCount = 0;
  let total = 0;

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
      typeof observation.value !== "number" ||
      !Number.isFinite(observation.value) ||
      observation.value < 0 ||
      !Number.isFinite(total + observation.value)
    ) {
      return Result.fail(new InvalidAnalysisValueError());
    }

    sampleCount += 1;
    total += observation.value;
  }

  const coverage = { sampleCount, notProvidedCount, unknownCount };
  return Result.succeed(
    Object.freeze(
      sampleCount === 0
        ? { ...coverage, status: "UNAVAILABLE" }
        : { ...coverage, status: "AVAILABLE", value: total / sampleCount },
    ),
  );
}
