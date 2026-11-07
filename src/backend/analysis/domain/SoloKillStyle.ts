import { Result } from "@praha/byethrow";
import { InvalidSoloKillRecordError } from "./errors/InvalidSoloKillRecordError";
import type { SoloKillRecord } from "./types/SoloKillRecord.type";
import type { SoloKillShare } from "./types/SoloKillShare.type";
import type { SoloKillSummary } from "./types/SoloKillSummary.type";

/** @description 단독 처치의 규모·빈도와 전체 처치 중 비중으로 독고다이 성향을 설명하는 불변 값이다. */
export class SoloKillStyle {
  /** @description 전체 입력 수와 서로 다른 유효 표본을 갖는 솔로킬 통계·비중을 함께 보존한다. */
  private constructor(
    readonly matchCount: number,
    readonly soloKills: SoloKillSummary,
    readonly share: SoloKillShare,
  ) {
    Object.freeze(this);
  }

  /** @description 경기 선정이나 외부 조회 없이 솔로킬 관측을 분석한다. 누락을 0으로 만들거나 백분율을 반올림하지 않는다. */
  static analyze(
    records: readonly SoloKillRecord[],
  ): Result.Result<SoloKillStyle, InvalidSoloKillRecordError> {
    if (records.some((record) => !SoloKillStyle.isValidRecord(record))) {
      return Result.fail(new InvalidSoloKillRecordError());
    }

    const summary = SoloKillStyle.summarize(records);

    if (Result.isFailure(summary)) {
      return summary;
    }

    const share = SoloKillStyle.calculateShare(records);

    if (Result.isFailure(share)) {
      return share;
    }

    return Result.succeed(
      new SoloKillStyle(records.length, summary.value, share.value),
    );
  }

  /** @description 비중 계산에서 제외되는 값도 검증하고 동일 경기의 솔로킬이 전체 킬을 넘지 않도록 한다. */
  private static isValidRecord(record: SoloKillRecord): boolean {
    const validCounts = [record.soloKills, record.kills].every(
      (count) =>
        count.status !== "AVAILABLE" ||
        (Number.isSafeInteger(count.value) && count.value >= 0),
    );

    if (!validCounts) {
      return false;
    }

    return (
      record.soloKills.status !== "AVAILABLE" ||
      record.kills.status !== "AVAILABLE" ||
      record.soloKills.value <= record.kills.value
    );
  }

  /** @description 전체 킬 제공 여부와 독립적으로 솔로킬 관측의 규모와 발생 빈도를 계산한다. */
  private static summarize(
    records: readonly SoloKillRecord[],
  ): Result.Result<SoloKillSummary, InvalidSoloKillRecordError> {
    let sampleCount = 0;
    let notProvidedCount = 0;
    let unknownCount = 0;
    let total = 0;
    let maximum = 0;
    let occurredMatchCount = 0;

    for (const { soloKills } of records) {
      if (soloKills.status === "NOT_PROVIDED") {
        notProvidedCount += 1;
        continue;
      }

      if (soloKills.status === "UNKNOWN") {
        unknownCount += 1;
        continue;
      }

      if (!Number.isSafeInteger(total + soloKills.value)) {
        return Result.fail(new InvalidSoloKillRecordError());
      }

      sampleCount += 1;
      total += soloKills.value;
      maximum = Math.max(maximum, soloKills.value);

      if (soloKills.value > 0) {
        occurredMatchCount += 1;
      }
    }

    const coverage = { sampleCount, notProvidedCount, unknownCount };
    const summary: SoloKillSummary =
      sampleCount === 0
        ? { ...coverage, status: "UNAVAILABLE" }
        : {
            ...coverage,
            status: "AVAILABLE",
            total,
            average: total / sampleCount,
            maximum,
            occurredMatchCount,
          };
    return Result.succeed(Object.freeze(summary));
  }

  /** @description 두 값이 확보된 공통 경기의 합계 비율만 사용하며 경기별 비중의 평균을 내지 않는다. */
  private static calculateShare(
    records: readonly SoloKillRecord[],
  ): Result.Result<SoloKillShare, InvalidSoloKillRecordError> {
    let sampleCount = 0;
    let soloKillTotal = 0;
    let killTotal = 0;

    for (const { soloKills, kills } of records) {
      if (soloKills.status !== "AVAILABLE" || kills.status !== "AVAILABLE") {
        continue;
      }

      if (!Number.isSafeInteger(killTotal + kills.value)) {
        return Result.fail(new InvalidSoloKillRecordError());
      }

      sampleCount += 1;
      soloKillTotal += soloKills.value;
      killTotal += kills.value;
    }

    const coverage = {
      sampleCount,
      excludedMatchCount: records.length - sampleCount,
    };

    if (sampleCount === 0) {
      return Result.succeed(
        Object.freeze({
          ...coverage,
          status: "UNAVAILABLE",
          reason: "NO_VALID_SAMPLES",
        }),
      );
    }

    if (killTotal === 0) {
      return Result.succeed(
        Object.freeze({
          ...coverage,
          status: "UNAVAILABLE",
          reason: "NO_KILLS",
        }),
      );
    }

    return Result.succeed(
      Object.freeze({
        ...coverage,
        status: "AVAILABLE",
        soloKillTotal,
        killTotal,
        percentage: (soloKillTotal / killTotal) * 100,
      }),
    );
  }
}
