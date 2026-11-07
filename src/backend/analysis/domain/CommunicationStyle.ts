import { Result } from "@praha/byethrow";
import { InvalidPingCountError } from "./errors/InvalidPingCountError";
import type { CommunicationPing } from "./types/CommunicationPing.type";
import type { CommunicationRecord } from "./types/CommunicationRecord.type";
import type { PingUsage } from "./types/PingUsage.type";

/** @description 분석 대상 경기에서 핑 종류별 사용량을 설명하는 불변 값. 경기 선정이나 외부 데이터 조회를 담당하지 않는다. */
export class CommunicationStyle {
  /** @description 계산된 사용량과 대상 경기 수만 보존하여 원본 변경에 영향받지 않는다. */
  private constructor(
    readonly matchCount: number,
    readonly pings: Readonly<Record<CommunicationPing, PingUsage>>,
  ) {
    Object.freeze(this);
  }

  /** @description 종류별 동일 유효 표본에서 평균·최다·합계를 계산한다. 미확보 값을 0으로 대체하거나 표시용 반올림을 하지 않는다. */
  static analyze(
    records: readonly CommunicationRecord[],
  ): Result.Result<CommunicationStyle, InvalidPingCountError> {
    const kinds = [
      "enemyMissing",
      "danger",
      "retreat",
      "getBack",
      "onMyWay",
      "allIn",
      "assistMe",
    ] as const satisfies readonly CommunicationPing[];
    const entries: [CommunicationPing, PingUsage][] = [];

    for (const kind of kinds) {
      const usage = CommunicationStyle.analyzePing(records, kind);

      if (Result.isFailure(usage)) {
        return usage;
      }

      entries.push([kind, usage.value]);
    }

    // 위의 고정 목록에서 모든 종류를 한 번씩 구성한다.
    const pings = Object.fromEntries(entries) as Record<
      CommunicationPing,
      PingUsage
    >;
    return Result.succeed(
      new CommunicationStyle(records.length, Object.freeze(pings)),
    );
  }

  /** @description 한 종류의 핑만 집계하여 종류별 표본 상태와 계산 규칙을 분리한다. */
  private static analyzePing(
    records: readonly CommunicationRecord[],
    kind: CommunicationPing,
  ): Result.Result<PingUsage, InvalidPingCountError> {
    let sampleCount = 0;
    let notProvidedCount = 0;
    let unknownCount = 0;
    let total = 0;
    let maximum = 0;

    for (const record of records) {
      const count = record[kind];

      if (count.status === "NOT_PROVIDED") {
        notProvidedCount += 1;
      } else if (count.status === "UNKNOWN") {
        unknownCount += 1;
      } else {
        if (
          !Number.isSafeInteger(count.value) ||
          count.value < 0 ||
          !Number.isSafeInteger(total + count.value)
        ) {
          return Result.fail(new InvalidPingCountError());
        }

        sampleCount += 1;
        total += count.value;
        maximum = Math.max(maximum, count.value);
      }
    }

    const coverage = { sampleCount, notProvidedCount, unknownCount };
    const usage: PingUsage =
      sampleCount === 0
        ? { ...coverage, status: "UNAVAILABLE" }
        : {
            ...coverage,
            status: "AVAILABLE",
            total,
            average: total / sampleCount,
            maximum,
          };
    return Result.succeed(Object.freeze(usage));
  }
}
