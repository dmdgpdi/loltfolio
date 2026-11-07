import { Result } from "@praha/byethrow";
import type { InvalidAnalysisValueError } from "./errors/InvalidAnalysisValueError";
import { summarizeAnalysisCounts } from "./summarizeAnalysisCounts";
import type { OwnTowerKillRecord } from "./types/OwnTowerKillRecord.type";
import type { OwnTowerKillStyle } from "./types/OwnTowerKillStyle.type";

/** @description 원천 판정의 행동 규모와 빈도를 독립 집계하며 교전 승리나 생존 여부를 추정하지 않는다. */
export function analyzeOwnTowerKillStyle(
  records: readonly OwnTowerKillRecord[],
): Result.Result<OwnTowerKillStyle, InvalidAnalysisValueError> {
  const metric = summarizeAnalysisCounts(
    records.map((record) => record.killsUnderOwnTower),
  );

  if (Result.isFailure(metric)) {
    return metric;
  }

  return Result.succeed(
    Object.freeze({
      matchCount: records.length,
      killsUnderOwnTower: metric.value,
    }),
  );
}
