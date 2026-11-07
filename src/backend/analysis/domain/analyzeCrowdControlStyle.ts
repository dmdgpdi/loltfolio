import { Result } from "@praha/byethrow";
import { averageAnalysisValues } from "./averageAnalysisValues";
import type { InvalidAnalysisValueError } from "./errors/InvalidAnalysisValueError";
import { summarizeAnalysisCounts } from "./summarizeAnalysisCounts";
import type { CrowdControlRecord } from "./types/CrowdControlRecord.type";
import type { CrowdControlStyle } from "./types/CrowdControlStyle.type";

/** @description 이동 불가 횟수·CC 시간·아군 연계 처치를 별도 표본에서 계산하며 임계값을 추가하지 않는다. */
export function analyzeCrowdControlStyle(
  records: readonly CrowdControlRecord[],
): Result.Result<CrowdControlStyle, InvalidAnalysisValueError> {
  const immobilizations = summarizeAnalysisCounts(
    records.map((record) => record.immobilizations),
  );

  if (Result.isFailure(immobilizations)) {
    return immobilizations;
  }

  const averageCrowdControlSeconds = averageAnalysisValues(
    records.map((record) => record.crowdControlSeconds),
  );

  if (Result.isFailure(averageCrowdControlSeconds)) {
    return averageCrowdControlSeconds;
  }

  const immobilizeAndKillWithAlly = summarizeAnalysisCounts(
    records.map((record) => record.immobilizeAndKillWithAlly),
  );

  if (Result.isFailure(immobilizeAndKillWithAlly)) {
    return immobilizeAndKillWithAlly;
  }

  return Result.succeed(
    Object.freeze({
      matchCount: records.length,
      immobilizations: immobilizations.value,
      averageCrowdControlSeconds: averageCrowdControlSeconds.value,
      immobilizeAndKillWithAlly: immobilizeAndKillWithAlly.value,
    }),
  );
}
