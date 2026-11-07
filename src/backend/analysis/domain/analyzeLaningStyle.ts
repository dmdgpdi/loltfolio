import { Result } from "@praha/byethrow";
import type { InvalidAnalysisPositionError } from "./errors/InvalidAnalysisPositionError";
import { InvalidLaningRecordError } from "./errors/InvalidLaningRecordError";
import { PositionDistribution } from "./PositionDistribution";
import type { AnalysisMetric } from "./types/AnalysisMetric.type";
import type { AnalysisObservation } from "./types/AnalysisObservation.type";
import type { LaningGrowth } from "./types/LaningGrowth.type";
import type { LaningGrowthSummary } from "./types/LaningGrowthSummary.type";
import type { LaningPointSummary } from "./types/LaningPointSummary.type";
import type { LaningRecord } from "./types/LaningRecord.type";
import type { LaningStyle } from "./types/LaningStyle.type";
import type { MatchFrequency } from "./types/MatchFrequency.type";

/** @description 랭크 라이너의 원천 우위 판정과 실제 성장 격차를 독립 집계한다. */
export function analyzeLaningStyle(
  records: readonly LaningRecord[],
): Result.Result<
  LaningStyle,
  InvalidAnalysisPositionError | InvalidLaningRecordError
> {
  const positions = PositionDistribution.analyze(records);

  if (Result.isFailure(positions)) {
    return positions;
  }

  if (
    records.some(
      ({ gameRule }) =>
        !["SOLO_RANKED", "FLEX_RANKED", "OTHER"].includes(gameRule),
    )
  ) {
    return Result.fail(new InvalidLaningRecordError());
  }

  const selected = records.filter(
    ({ gameRule, position }) =>
      gameRule !== "OTHER" &&
      position.status === "AVAILABLE" &&
      ["TOP", "MIDDLE", "BOTTOM"].includes(position.value),
  );

  if (!selected.every(hasValidPoints)) {
    return Result.fail(new InvalidLaningRecordError());
  }

  const direct = summarizeDirect(selected);

  if (Result.isFailure(direct)) {
    return direct;
  }

  const ten = summarizePoint(selected, 10);
  const fifteen = summarizePoint(selected, 15);

  if (Result.isFailure(ten)) {
    return ten;
  }

  if (Result.isFailure(fifteen)) {
    return fifteen;
  }

  return Result.succeed(
    Object.freeze({
      matchCount: records.length,
      laningMatchCount: selected.length,
      ...direct.value,
      tenMinutes: ten.value,
      fifteenMinutes: fifteen.value,
    }),
  );
}

/** @description 원천 판정 빈도와 독립적인 세 성장 지표의 평균을 계산한다. */
function summarizeDirect(
  records: readonly LaningRecord[],
): Result.Result<
  Omit<
    LaningStyle,
    "matchCount" | "laningMatchCount" | "tenMinutes" | "fifteenMinutes"
  >,
  InvalidLaningRecordError
> {
  const early = summarizeAdvantage(
    records.map((record) => record.earlyAdvantageIndicator),
  );
  const laning = summarizeAdvantage(
    records.map((record) => record.laningAdvantageIndicator),
  );
  const cs = summarize(
    records.map((record) => record.laneMinionsFirst10Minutes),
  );
  const level = summarize(records.map((record) => record.maximumLevelLead));
  const plates = summarize(
    records.map((record) => record.towerPlates),
    "OWN",
  );

  if (Result.isFailure(early)) {
    return early;
  }

  if (Result.isFailure(laning)) {
    return laning;
  }

  if (Result.isFailure(cs)) {
    return cs;
  }

  if (Result.isFailure(level)) {
    return level;
  }

  if (Result.isFailure(plates)) {
    return plates;
  }

  return Result.succeed({
    earlyAdvantage: early.value,
    laningAdvantage: laning.value,
    averageLaneMinionsFirst10Minutes: cs.value,
    averageMaximumLevelLead: level.value,
    averageTowerPlates: plates.value,
  });
}

/** @description 정상적인 미지의 원천 숫자는 판별 불가로 분류하며 0을 패배로 해석하지 않는다. */
function summarizeAdvantage(
  observations: readonly AnalysisObservation<number>[],
): Result.Result<MatchFrequency, InvalidLaningRecordError> {
  const normalized = observations.map(
    (observation): AnalysisObservation<number> =>
      observation.status === "AVAILABLE" &&
      Number.isFinite(observation.value) &&
      observation.value !== 0 &&
      observation.value !== 1
        ? { status: "UNKNOWN" }
        : observation,
  );
  const metric = summarize(normalized, "INDICATOR");

  if (Result.isFailure(metric)) {
    return metric;
  }

  if (metric.value.status === "UNAVAILABLE") {
    return Result.succeed(metric.value);
  }

  const matchedMatchCount = normalized.filter(
    (observation) =>
      observation.status === "AVAILABLE" && observation.value === 1,
  ).length;
  return Result.succeed(
    Object.freeze({
      ...metric.value,
      value: Object.freeze({
        matchedMatchCount,
        percentage: (matchedMatchCount / metric.value.sampleCount) * 100,
      }),
    }),
  );
}

/** @description 중복 목표 시점과 확보된 실제 시각의 범위를 확인하며 보간이나 원천 판정 재현은 하지 않는다. */
function hasValidPoints(record: LaningRecord): boolean {
  const seen = new Set<number>();

  for (const point of record.points) {
    if (
      (point.minute !== 10 && point.minute !== 15) ||
      seen.has(point.minute)
    ) {
      return false;
    }

    seen.add(point.minute);
    const timestamp = point.actualTimestampMs;

    if (
      timestamp.status === "AVAILABLE" &&
      (!Number.isSafeInteger(timestamp.value) ||
        Math.abs(timestamp.value - point.minute * 60000) > 5000)
    ) {
      return false;
    }
  }

  return true;
}

/** @description 한 경기 한 시점의 본인 성장과 상대 차이를 별도 표본으로 계산한다. */
function summarizePoint(
  records: readonly LaningRecord[],
  minute: 10 | 15,
): Result.Result<LaningPointSummary, InvalidLaningRecordError> {
  const own = summarizeGrowth(records, minute, "own");
  const difference = summarizeGrowth(records, minute, "opponentDifference");

  if (Result.isFailure(own)) {
    return own;
  }

  if (Result.isFailure(difference)) {
    return difference;
  }

  return Result.succeed(
    Object.freeze({ own: own.value, opponentDifference: difference.value }),
  );
}

/** @description 성장 전체의 미확보 상태를 각 항목에 전파하고 항목별 유효 표본으로 평균한다. */
function summarizeGrowth(
  records: readonly LaningRecord[],
  minute: 10 | 15,
  kind: "own" | "opponentDifference",
): Result.Result<LaningGrowthSummary, InvalidLaningRecordError> {
  const keys = ["gold", "experience", "level", "laneCs", "jungleCs"] as const;
  const entries: [keyof LaningGrowth, AnalysisMetric<number>][] = [];

  for (const key of keys) {
    const observations = records.map((record): AnalysisObservation<number> => {
      const growth = record.points.find((point) => point.minute === minute)?.[
        kind
      ];
      return growth?.status === "AVAILABLE"
        ? growth.value[key]
        : (growth ?? { status: "NOT_PROVIDED" });
    });
    const metric = summarize(
      observations,
      kind === "own" ? "OWN" : "DIFFERENCE",
    );

    if (Result.isFailure(metric)) {
      return metric;
    }

    entries.push([key, metric.value]);
  }

  // 고정 목록으로 모든 성장 항목을 구성한다.
  return Result.succeed(
    Object.freeze(Object.fromEntries(entries) as LaningGrowthSummary),
  );
}

/** @description 미관측을 제외하고 성장의 정수 정밀도와 격차 부호를 유지해 평균한다. */
function summarize(
  observations: readonly AnalysisObservation<number>[],
  mode: "NONNEGATIVE" | "INDICATOR" | "OWN" | "DIFFERENCE" = "NONNEGATIVE",
): Result.Result<AnalysisMetric<number>, InvalidLaningRecordError> {
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

    if (!isValidNumber(observation.value, total, mode)) {
      return Result.fail(new InvalidLaningRecordError());
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

/** @description 원천 판정 이외의 본인 값은 비음수이며 성장 스냅샷과 격차는 안전한 정수로 검증한다. */
function isValidNumber(
  value: number,
  total: number,
  mode: "NONNEGATIVE" | "INDICATOR" | "OWN" | "DIFFERENCE",
): boolean {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isFinite(total + value) &&
    (mode === "DIFFERENCE" || mode === "INDICATOR" || value >= 0) &&
    ((mode !== "OWN" && mode !== "DIFFERENCE") ||
      (Number.isSafeInteger(value) && Number.isSafeInteger(total + value)))
  );
}
