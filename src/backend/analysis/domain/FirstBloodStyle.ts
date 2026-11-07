import type { FirstBloodOccurrence } from "./types/FirstBloodOccurrence.type";
import type { FirstBloodParticipation } from "./types/FirstBloodParticipation.type";
import type { FirstBloodRecord } from "./types/FirstBloodRecord.type";

/** @description 첫 킬 직접 획득·어시스트와 전체 관여를 구분해 설명하는 불변 성향이다. 경기 선정과 외부 조회는 수행하지 않는다. */
export class FirstBloodStyle {
  /** @description 항목마다 다른 유효 표본을 보존하고 원본과 참조를 공유하지 않는다. */
  private constructor(
    readonly matchCount: number,
    readonly kills: FirstBloodOccurrence,
    readonly assists: FirstBloodOccurrence,
    readonly participation: FirstBloodParticipation,
  ) {
    Object.freeze(this);
  }

  /** @description 확보된 불리언을 집계한다. 관측 누락도 유효 입력이므로 표본 상태로 표현하며 관여를 임의 추정하지 않는다. */
  static analyze(records: readonly FirstBloodRecord[]): FirstBloodStyle {
    return new FirstBloodStyle(
      records.length,
      FirstBloodStyle.summarizeOccurrence(records, "kill"),
      FirstBloodStyle.summarizeOccurrence(records, "assist"),
      FirstBloodStyle.summarizeParticipation(records),
    );
  }

  /** @description 직접 획득과 어시스트의 독립적인 관측 상태와 발생 비율을 계산한다. */
  private static summarizeOccurrence(
    records: readonly FirstBloodRecord[],
    kind: keyof FirstBloodRecord,
  ): FirstBloodOccurrence {
    let sampleCount = 0;
    let notProvidedCount = 0;
    let unknownCount = 0;
    let occurredMatchCount = 0;

    for (const record of records) {
      const observation = record[kind];

      if (observation.status === "NOT_PROVIDED") {
        notProvidedCount += 1;
        continue;
      }

      if (observation.status === "UNKNOWN") {
        unknownCount += 1;
        continue;
      }

      sampleCount += 1;

      if (observation.value) {
        occurredMatchCount += 1;
      }
    }

    const coverage = { sampleCount, notProvidedCount, unknownCount };
    const occurrence: FirstBloodOccurrence =
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

  /** @description 하나라도 true면 관여, 둘 다 false면 미관여이며 나머지는 유효 분모에서 제외한다. */
  private static summarizeParticipation(
    records: readonly FirstBloodRecord[],
  ): FirstBloodParticipation {
    let sampleCount = 0;
    let unresolvedMatchCount = 0;
    let participatedMatchCount = 0;

    for (const record of records) {
      const flags = [record.kill, record.assist];

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
    const participation: FirstBloodParticipation =
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
