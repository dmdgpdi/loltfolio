import { Result } from "@praha/byethrow";
import { averageAnalysisValues } from "./averageAnalysisValues";
import type { InvalidAnalysisValueError } from "./errors/InvalidAnalysisValueError";
import { summarizeAnalysisCounts } from "./summarizeAnalysisCounts";
import type { AllyProtectionRecord } from "./types/AllyProtectionRecord.type";
import type { AllyProtectionStyle } from "./types/AllyProtectionStyle.type";

/** @description 회복·보호막 피해 흡수·구출을 다른 단위의 독립 지표로 보존한다. */
export function analyzeAllyProtectionStyle(
  records: readonly AllyProtectionRecord[],
): Result.Result<AllyProtectionStyle, InvalidAnalysisValueError> {
  const averageHealingToAllies = averageAnalysisValues(
    records.map((record) => record.healingToAllies),
  );

  if (Result.isFailure(averageHealingToAllies)) {
    return averageHealingToAllies;
  }

  const averageDamageShieldedOnAllies = averageAnalysisValues(
    records.map((record) => record.damageShieldedOnAllies),
  );

  if (Result.isFailure(averageDamageShieldedOnAllies)) {
    return averageDamageShieldedOnAllies;
  }

  const allySaves = summarizeAnalysisCounts(
    records.map((record) => record.allySaves),
  );

  if (Result.isFailure(allySaves)) {
    return allySaves;
  }

  return Result.succeed(
    Object.freeze({
      matchCount: records.length,
      averageHealingToAllies: averageHealingToAllies.value,
      averageDamageShieldedOnAllies: averageDamageShieldedOnAllies.value,
      allySaves: allySaves.value,
    }),
  );
}
