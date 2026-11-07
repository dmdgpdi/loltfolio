import { Result } from "@praha/byethrow";
import { InvalidVisionCountError } from "./errors/InvalidVisionCountError";
import type { VisionActivity } from "./types/VisionActivity.type";
import type { VisionRecord } from "./types/VisionRecord.type";

/** @description 와드 구매·설치·제거 행동으로 시야 스타일을 설명하는 불변 값. 경기 선정·모드별 노출은 수행하지 않는다. */
export class VisionStyle {
  /** @description 원본을 보관하지 않고 각 행동의 집계와 표본 상태만 보존한다. */
  private constructor(
    readonly matchCount: number,
    readonly activities: Readonly<Record<keyof VisionRecord, VisionActivity>>,
  ) {
    Object.freeze(this);
  }

  /** @description 유효 관측만 사용해 시야 행동을 계산하며, 제어 와드 구매의 zeroMatchCount가 미구매 경기 수다. */
  static analyze(
    records: readonly VisionRecord[],
  ): Result.Result<VisionStyle, InvalidVisionCountError> {
    const kinds = [
      "controlWardsBought",
      "wardsPlaced",
      "wardsRemoved",
      "wardTakedownsBefore20Minutes",
    ] as const satisfies readonly (keyof VisionRecord)[];
    const entries: [keyof VisionRecord, VisionActivity][] = [];

    for (const kind of kinds) {
      const activity = VisionStyle.analyzeActivity(records, kind);

      if (Result.isFailure(activity)) {
        return activity;
      }

      entries.push([kind, activity.value]);
    }

    // 고정 목록에서 모든 시야 행동을 한 번씩 구성한다.
    const activities = Object.fromEntries(entries) as Record<
      keyof VisionRecord,
      VisionActivity
    >;
    return Result.succeed(
      new VisionStyle(records.length, Object.freeze(activities)),
    );
  }

  /** @description 한 시야 행동의 표본과 사용량을 계산한다. 미관측은 0회 경기 수에 포함하지 않는다. */
  private static analyzeActivity(
    records: readonly VisionRecord[],
    kind: keyof VisionRecord,
  ): Result.Result<VisionActivity, InvalidVisionCountError> {
    let sampleCount = 0;
    let notProvidedCount = 0;
    let unknownCount = 0;
    let total = 0;
    let zeroMatchCount = 0;

    for (const record of records) {
      const count = record[kind];

      if (count.status === "NOT_PROVIDED") {
        notProvidedCount += 1;
        continue;
      }

      if (count.status === "UNKNOWN") {
        unknownCount += 1;
        continue;
      }

      if (
        !Number.isSafeInteger(count.value) ||
        count.value < 0 ||
        !Number.isSafeInteger(total + count.value)
      ) {
        return Result.fail(new InvalidVisionCountError());
      }

      sampleCount += 1;
      total += count.value;

      if (count.value === 0) {
        zeroMatchCount += 1;
      }
    }

    const coverage = { sampleCount, notProvidedCount, unknownCount };
    const activity: VisionActivity =
      sampleCount === 0
        ? { ...coverage, status: "UNAVAILABLE" }
        : {
            ...coverage,
            status: "AVAILABLE",
            total,
            average: total / sampleCount,
            zeroMatchCount,
          };
    return Result.succeed(Object.freeze(activity));
  }
}
