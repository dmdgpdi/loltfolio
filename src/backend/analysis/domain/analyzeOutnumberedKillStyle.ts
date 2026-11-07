import { Result } from "@praha/byethrow";
import type { InvalidAnalysisValueError } from "./errors/InvalidAnalysisValueError";
import { summarizeAnalysisCounts } from "./summarizeAnalysisCounts";
import type { OutnumberedKillRecord } from "./types/OutnumberedKillRecord.type";
import type { OutnumberedKillStyle } from "./types/OutnumberedKillStyle.type";

/** @description 원천 판정의 행동 규모와 빈도를 독립 집계하며 교전 승리나 생존 여부를 추정하지 않는다. */
export function analyzeOutnumberedKillStyle(
  records: readonly OutnumberedKillRecord[],
): Result.Result<OutnumberedKillStyle, InvalidAnalysisValueError> {
  const metric = summarizeAnalysisCounts(
    records.map((record) => record.outnumberedKills),
  );

  if (Result.isFailure(metric)) {
    return metric;
  }

  return Result.succeed(
    Object.freeze({
      matchCount: records.length,
      outnumberedKills: metric.value,
    }),
  );
}
