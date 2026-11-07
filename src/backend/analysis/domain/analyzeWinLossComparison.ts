import { Result } from "@praha/byethrow";
import { InvalidAnalysisValueError } from "./errors/InvalidAnalysisValueError";
import { summarizeAnalysisCounts } from "./summarizeAnalysisCounts";
import type { AnalysisMetric } from "./types/AnalysisMetric.type";
import type { WinLossComparison } from "./types/WinLossComparison.type";
import type { WinLossMetric } from "./types/WinLossMetric.type";
import type { WinLossRecord } from "./types/WinLossRecord.type";

/** @description 승패별 같은 행동의 독립 평균과 차이를 반환하며 인과나 타인 대비 우열을 추정하지 않는다. */
export function analyzeWinLossComparison(
  records: readonly WinLossRecord[],
): Result.Result<WinLossComparison, InvalidAnalysisValueError> {
  const keys = [
    "enemyMissingPings",
    "dangerPings",
    "retreatPings",
    "controlWardsBought",
    "wardsRemoved",
    "soloKills",
  ] as const;

  if (records.some((record) => !isValidRecord(record, keys))) {
    return Result.fail(new InvalidAnalysisValueError());
  }

  const wins = records.filter(
    ({ win }) => win.status === "AVAILABLE" && win.value,
  );
  const losses = records.filter(
    ({ win }) => win.status === "AVAILABLE" && !win.value,
  );
  const entries: [(typeof keys)[number], WinLossMetric][] = [];

  for (const key of keys) {
    const metric = compareMetric(wins, losses, key);

    if (Result.isFailure(metric)) {
      return metric;
    }

    entries.push([key, metric.value]);
  }

  // 고정 목록으로 모든 비교 지표를 구성한다.
  const metrics = Object.fromEntries(entries) as Record<
    (typeof keys)[number],
    WinLossMetric
  >;
  return Result.succeed(
    Object.freeze({
      matchCount: records.length,
      winMatchCount: wins.length,
      lossMatchCount: losses.length,
      winNotProvidedMatchCount: records.filter(
        ({ win }) => win.status === "NOT_PROVIDED",
      ).length,
      winUnknownMatchCount: records.filter(
        ({ win }) => win.status === "UNKNOWN",
      ).length,
      ...metrics,
    }),
  );
}

/** @description 승패 미확보 경기의 잘못된 확보 행동도 입력 오류로 처리한다. */
function isValidRecord(
  record: WinLossRecord,
  keys: readonly Exclude<keyof WinLossRecord, "win">[],
): boolean {
  return (
    (record.win.status !== "AVAILABLE" ||
      typeof record.win.value === "boolean") &&
    keys.every(
      (key) =>
        record[key].status !== "AVAILABLE" ||
        (Number.isSafeInteger(record[key].value) && record[key].value >= 0),
    )
  );
}

/** @description 한 집단의 지표가 없으면 다른 집단 평균을 유지하고 차이만 제공하지 않는다. */
function compareMetric(
  wins: readonly WinLossRecord[],
  losses: readonly WinLossRecord[],
  key: Exclude<keyof WinLossRecord, "win">,
): Result.Result<WinLossMetric, InvalidAnalysisValueError> {
  const win = averageCount(wins, key);
  const loss = averageCount(losses, key);

  if (Result.isFailure(win)) {
    return win;
  }

  if (Result.isFailure(loss)) {
    return loss;
  }

  const difference =
    win.value.status === "AVAILABLE" && loss.value.status === "AVAILABLE"
      ? Object.freeze({
          status: "AVAILABLE" as const,
          value: win.value.value - loss.value.value,
        })
      : Object.freeze({ status: "UNAVAILABLE" as const });
  return Result.succeed(
    Object.freeze({ wins: win.value, losses: loss.value, difference }),
  );
}

/** @description 행동 횟수의 합계 정밀도를 검증한 뒤 해당 집단 표본만의 평균을 보존한다. */
function averageCount(
  records: readonly WinLossRecord[],
  key: Exclude<keyof WinLossRecord, "win">,
): Result.Result<AnalysisMetric<number>, InvalidAnalysisValueError> {
  const metric = summarizeAnalysisCounts(records.map((record) => record[key]));

  if (Result.isFailure(metric)) {
    return metric;
  }

  return Result.succeed(
    Object.freeze(
      metric.value.status === "AVAILABLE"
        ? { ...metric.value, value: metric.value.value.average }
        : metric.value,
    ),
  );
}
