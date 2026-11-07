import { Result } from "@praha/byethrow";
import { InvalidFirstTowerObservationError } from "./errors/InvalidFirstTowerObservationError";
import { InvalidStructureCountError } from "./errors/InvalidStructureCountError";
import type { FirstTowerOccurrence } from "./types/FirstTowerOccurrence.type";
import type { FirstTowerParticipation } from "./types/FirstTowerParticipation.type";
import type { StructureActivity } from "./types/StructureActivity.type";
import type { StructureRecord } from "./types/StructureRecord.type";

/** @description 포탑·방패·억제기 관여와 첫 포탑 관여를 설명하는 불변 철거 성향이다. 경기 선정이나 외부 조회를 수행하지 않는다. */
export class StructureStyle {
  /** @description 직접 파괴를 확인할 수 있는 경기의 발생 수와 비율이다. */
  readonly firstTowerKills: FirstTowerOccurrence;
  /** @description 어시스트를 확인할 수 있는 경기의 발생 수와 비율이다. */
  readonly firstTowerAssists: FirstTowerOccurrence;
  /** @description 직접 파괴·어시스트의 OR로 판정한 경기별 관여와 비율이다. */
  readonly firstTowerParticipation: FirstTowerParticipation;

  /** @description 집계 결과만 동결해 원본의 변경으로 철거 성향이 바뀌지 않게 한다. */
  private constructor(
    readonly matchCount: number,
    readonly activities: Readonly<
      Record<
        "towerTakedowns" | "towerPlates" | "inhibitorTakedowns",
        StructureActivity
      >
    >,
    firstTower: Readonly<{
      kills: FirstTowerOccurrence;
      assists: FirstTowerOccurrence;
      participation: FirstTowerParticipation;
    }>,
  ) {
    this.firstTowerKills = firstTower.kills;
    this.firstTowerAssists = firstTower.assists;
    this.firstTowerParticipation = firstTower.participation;
    Object.freeze(this);
  }

  /** @description 행동별 유효 표본을 집계하고 첫 포탑의 개별 발생·전체 관여를 구분한다. 잘못된 확보 값은 입력 오류로 반환한다. */
  static analyze(
    records: readonly StructureRecord[],
  ): Result.Result<
    StructureStyle,
    InvalidStructureCountError | InvalidFirstTowerObservationError
  > {
    if (
      records.some((record) =>
        StructureStyle.hasInvalidFirstTowerObservation(record),
      )
    ) {
      return Result.fail(new InvalidFirstTowerObservationError());
    }

    const kinds = [
      "towerTakedowns",
      "towerPlates",
      "inhibitorTakedowns",
    ] as const;
    const entries: [(typeof kinds)[number], StructureActivity][] = [];

    for (const kind of kinds) {
      const activity = StructureStyle.analyzeActivity(records, kind);

      if (Result.isFailure(activity)) {
        return activity;
      }

      entries.push([kind, activity.value]);
    }

    // 고정 목록에서 모든 구조물 행동을 한 번씩 구성한다.
    const activities = Object.fromEntries(entries) as Record<
      (typeof kinds)[number],
      StructureActivity
    >;
    return Result.succeed(
      new StructureStyle(records.length, Object.freeze(activities), {
        kills: StructureStyle.analyzeFirstTowerOccurrence(
          records,
          "firstTowerKill",
        ),
        assists: StructureStyle.analyzeFirstTowerOccurrence(
          records,
          "firstTowerAssist",
        ),
        participation: StructureStyle.analyzeFirstTower(records),
      }),
    );
  }

  /** @description 다른 관측만으로 OR 판정이 가능해도 잘못된 불리언 원값을 숨기지 않는다. */
  private static hasInvalidFirstTowerObservation(
    record: StructureRecord,
  ): boolean {
    return [record.firstTowerKill, record.firstTowerAssist].some(
      (flag) => flag.status === "AVAILABLE" && typeof flag.value !== "boolean",
    );
  }

  /** @description 직접 파괴와 어시스트 각각의 유효·미확보 표본을 보존하고 백분율을 반올림하지 않는다. */
  private static analyzeFirstTowerOccurrence(
    records: readonly StructureRecord[],
    kind: "firstTowerKill" | "firstTowerAssist",
  ): FirstTowerOccurrence {
    let sampleCount = 0;
    let notProvidedCount = 0;
    let unknownCount = 0;
    let occurredMatchCount = 0;

    for (const record of records) {
      const flag = record[kind];

      if (flag.status === "NOT_PROVIDED") {
        notProvidedCount += 1;
        continue;
      }

      if (flag.status === "UNKNOWN") {
        unknownCount += 1;
        continue;
      }

      sampleCount += 1;

      if (flag.value) {
        occurredMatchCount += 1;
      }
    }

    const coverage = { sampleCount, notProvidedCount, unknownCount };
    const occurrence: FirstTowerOccurrence =
      sampleCount === 0
        ? { ...coverage, status: "UNAVAILABLE" }
        : {
            ...coverage,
            status: "AVAILABLE",
            occurredMatchCount,
            percentage: (occurredMatchCount / sampleCount) * 100,
          };
    return Object.freeze(occurrence);
  }

  /** @description 한 구조물 행동의 표본과 사용량을 계산한다. 미관측은 0회 경기 수에 포함하지 않는다. */
  private static analyzeActivity(
    records: readonly StructureRecord[],
    kind: "towerTakedowns" | "towerPlates" | "inhibitorTakedowns",
  ): Result.Result<StructureActivity, InvalidStructureCountError> {
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
        return Result.fail(new InvalidStructureCountError());
      }

      sampleCount += 1;
      total += count.value;

      if (count.value === 0) {
        zeroMatchCount += 1;
      }
    }

    const coverage = { sampleCount, notProvidedCount, unknownCount };
    const activity: StructureActivity =
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

  /** @description 한 플래그가 true면 관여, 모두 false면 미관여이며 그 외에는 판정 불가로 남긴다. */
  private static analyzeFirstTower(
    records: readonly StructureRecord[],
  ): FirstTowerParticipation {
    let sampleCount = 0;
    let unresolvedMatchCount = 0;
    let participatedMatchCount = 0;

    for (const record of records) {
      const flags = [record.firstTowerKill, record.firstTowerAssist];

      if (flags.some((flag) => flag.status === "AVAILABLE" && flag.value)) {
        sampleCount += 1;
        participatedMatchCount += 1;
      } else if (flags.every((flag) => flag.status === "AVAILABLE")) {
        sampleCount += 1;
      } else {
        unresolvedMatchCount += 1;
      }
    }

    const coverage = { sampleCount, unresolvedMatchCount };
    const participation: FirstTowerParticipation =
      sampleCount === 0
        ? { ...coverage, status: "UNAVAILABLE" }
        : {
            ...coverage,
            status: "AVAILABLE",
            participatedMatchCount,
            percentage: (participatedMatchCount / sampleCount) * 100,
          };
    return Object.freeze(participation);
  }
}
