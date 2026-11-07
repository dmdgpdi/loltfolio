import { Result } from "@praha/byethrow";
import type { InvalidAnalysisValueError } from "./errors/InvalidAnalysisValueError";
import { summarizeAnalysisCounts } from "./summarizeAnalysisCounts";
import type { SkillshotDodgeRecord } from "./types/SkillshotDodgeRecord.type";
import type { SkillshotDodgeStyle } from "./types/SkillshotDodgeStyle.type";

/** @description 원천 판정의 행동 규모와 빈도를 독립 집계하며 교전 승리나 생존 여부를 추정하지 않는다. */
export function analyzeSkillshotDodgeStyle(
  records: readonly SkillshotDodgeRecord[],
): Result.Result<SkillshotDodgeStyle, InvalidAnalysisValueError> {
  const metric = summarizeAnalysisCounts(
    records.map((record) => record.skillshotsDodged),
  );

  if (Result.isFailure(metric)) {
    return metric;
  }

  return Result.succeed(
    Object.freeze({
      matchCount: records.length,
      skillshotsDodged: metric.value,
    }),
  );
}
