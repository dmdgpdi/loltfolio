import { Result } from "@praha/byethrow";
import { averageAnalysisValues } from "./averageAnalysisValues";
import { InvalidAnalysisValueError } from "./errors/InvalidAnalysisValueError";
import type { DamageTakenRecord } from "./types/DamageTakenRecord.type";
import type { DamageTakenStyle } from "./types/DamageTakenStyle.type";

/** @description 받은 피해와 경감량을 분리하고 팀 비중은 경기별 원비율 평균을 백분율로 변환한다. */
export function analyzeDamageTakenStyle(
  records: readonly DamageTakenRecord[],
): Result.Result<DamageTakenStyle, InvalidAnalysisValueError> {
  if (
    records.some(
      ({ teamDamageTakenRatio: ratio }) =>
        ratio.status === "AVAILABLE" &&
        (typeof ratio.value !== "number" ||
          !Number.isFinite(ratio.value) ||
          ratio.value < 0 ||
          ratio.value > 1),
    )
  ) {
    return Result.fail(new InvalidAnalysisValueError());
  }

  const averageDamageTaken = averageAnalysisValues(
    records.map((record) => record.damageTaken),
  );

  if (Result.isFailure(averageDamageTaken)) {
    return averageDamageTaken;
  }

  const averageDamageMitigated = averageAnalysisValues(
    records.map((record) => record.damageMitigated),
  );

  if (Result.isFailure(averageDamageMitigated)) {
    return averageDamageMitigated;
  }

  const averageTeamDamageTakenPercentage = averageAnalysisValues(
    records.map((record) => record.teamDamageTakenRatio),
  );

  if (Result.isFailure(averageTeamDamageTakenPercentage)) {
    return averageTeamDamageTakenPercentage;
  }

  return Result.succeed(
    Object.freeze({
      matchCount: records.length,
      averageDamageTaken: averageDamageTaken.value,
      averageDamageMitigated: averageDamageMitigated.value,
      averageTeamDamageTakenPercentage: Object.freeze(
        averageTeamDamageTakenPercentage.value.status === "AVAILABLE"
          ? {
              ...averageTeamDamageTakenPercentage.value,
              value: averageTeamDamageTakenPercentage.value.value * 100,
            }
          : averageTeamDamageTakenPercentage.value,
      ),
    }),
  );
}
