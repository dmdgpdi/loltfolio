import { Result } from "@praha/byethrow";
import { InvalidAnalysisValueError } from "./errors/InvalidAnalysisValueError";
import { summarizeAnalysisCounts } from "./summarizeAnalysisCounts";
import type { AnalysisShare } from "./types/AnalysisShare.type";
import type { EnemyTowerKillRecord } from "./types/EnemyTowerKillRecord.type";
import type { EnemyTowerKillStyle } from "./types/EnemyTowerKillStyle.type";

/** @description 적 포탑 근처 처치와 공통 표본의 전체 킬 대비 비중을 구분하며 다이브 성공으로 해석하지 않는다. */
export function analyzeEnemyTowerKillStyle(
  records: readonly EnemyTowerKillRecord[],
): Result.Result<EnemyTowerKillStyle, InvalidAnalysisValueError> {
  const kills = summarizeAnalysisCounts(
    records.map((record) => record.killsNearEnemyTower),
  );

  if (Result.isFailure(kills)) {
    return kills;
  }

  const share = summarizeShare(records);

  if (Result.isFailure(share)) {
    return share;
  }

  return Result.succeed(
    Object.freeze({
      matchCount: records.length,
      killsNearEnemyTower: kills.value,
      shareOfKills: share.value,
    }),
  );
}

/** @description 전체 킬 원값은 누락된 분자와 무관하게 검증하고 공통 표본의 합계 비중만 계산한다. */
function summarizeShare(
  records: readonly EnemyTowerKillRecord[],
): Result.Result<AnalysisShare, InvalidAnalysisValueError> {
  let sampleCount = 0;
  let numerator = 0;
  let denominator = 0;

  for (const record of records) {
    const kills = record.kills;
    const near = record.killsNearEnemyTower;

    if (
      kills.status === "AVAILABLE" &&
      (!Number.isSafeInteger(kills.value) || kills.value < 0)
    ) {
      return Result.fail(new InvalidAnalysisValueError());
    }

    if (kills.status !== "AVAILABLE" || near.status !== "AVAILABLE") {
      continue;
    }

    if (
      near.value > kills.value ||
      !Number.isSafeInteger(denominator + kills.value)
    ) {
      return Result.fail(new InvalidAnalysisValueError());
    }

    sampleCount += 1;
    numerator += near.value;
    denominator += kills.value;
  }

  const coverage = {
    sampleCount,
    excludedMatchCount: records.length - sampleCount,
  };

  if (sampleCount === 0 || denominator === 0) {
    return Result.succeed(
      Object.freeze({
        ...coverage,
        status: "UNAVAILABLE",
        reason: sampleCount === 0 ? "NO_VALID_SAMPLES" : "ZERO_DENOMINATOR",
      }),
    );
  }

  return Result.succeed(
    Object.freeze({
      ...coverage,
      status: "AVAILABLE",
      numerator,
      denominator,
      percentage: (numerator / denominator) * 100,
    }),
  );
}
