import type { Result } from "@praha/byethrow";
import { expectTypeOf, it } from "vitest";
import type { QueueId } from "../../match/domain/types/QueueId.type";
import type { CommunicationRecord } from "../domain/types/CommunicationRecord.type";
import type { LaningRecord } from "../domain/types/LaningRecord.type";
import type { AnalysisInputReader } from "./AnalysisInputReader";
import type { AnalysisReader } from "./AnalysisReader";
import type { AnalysisCalculationError } from "./errors/AnalysisCalculationError";
import type { AnalysisReadError } from "./errors/AnalysisReadError";
import type { AnalysisDto } from "./types/AnalysisDto.type";
import type { AnalysisInputSet } from "./types/AnalysisInputSet.type";
import type { AnalysisMatchInput } from "./types/AnalysisMatchInput.type";
import type { AnalysisTarget } from "./types/AnalysisTarget.type";

/** @description DTO가 함수·Date 같은 실행 객체 없이 JSON 값으로 구성되는지 확인하기 위한 자료형이다. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

it("입력 Reader는 분석 소유 기록과 원래 ID 범위를 반환한다", () => {
  // Assert
  expectTypeOf<Parameters<AnalysisInputReader["findLatest"]>>().toEqualTypeOf<
    [target: AnalysisTarget]
  >();
  expectTypeOf<ReturnType<AnalysisInputReader["findLatest"]>>().toEqualTypeOf<
    Promise<Result.Result<AnalysisInputSet | null, AnalysisReadError>>
  >();
  expectTypeOf<AnalysisInputSet["matches"]>().toEqualTypeOf<
    readonly AnalysisMatchInput[]
  >();
  expectTypeOf<AnalysisInputSet["selectedMatchIds"]>().toEqualTypeOf<
    readonly string[]
  >();
  expectTypeOf<
    AnalysisMatchInput["communication"]
  >().toEqualTypeOf<CommunicationRecord>();
  expectTypeOf<AnalysisMatchInput["laning"]>().toEqualTypeOf<LaningRecord>();
});

it("DTO Reader는 부재·조회 실패·계산 실패를 구분한다", () => {
  // Assert
  expectTypeOf<Parameters<AnalysisReader["findLatest"]>>().toEqualTypeOf<
    [target: AnalysisTarget]
  >();
  expectTypeOf<ReturnType<AnalysisReader["findLatest"]>>().toEqualTypeOf<
    Promise<
      Result.Result<
        AnalysisDto | null,
        AnalysisReadError | AnalysisCalculationError
      >
    >
  >();
  expectTypeOf<AnalysisDto["target"]["queueId"]>().toEqualTypeOf<QueueId>();
  expectTypeOf<AnalysisDto["analyzedMatchIds"]>().toEqualTypeOf<
    readonly string[]
  >();
});

it("두 Reader 계약은 조회만 노출한다", () => {
  // Assert
  expectTypeOf<keyof AnalysisInputReader>().toEqualTypeOf<"findLatest">();
  expectTypeOf<keyof AnalysisReader>().toEqualTypeOf<"findLatest">();
});

it("DTO는 JSON 데이터만 노출하고 생성·계산 메서드는 포함하지 않는다", () => {
  // Assert
  expectTypeOf<AnalysisDto>().toExtend<JsonValue>();
  expectTypeOf<keyof AnalysisDto["communication"]>().toEqualTypeOf<
    "matchCount" | "pings"
  >();
  expectTypeOf<keyof AnalysisDto["structure"]>().toEqualTypeOf<
    | "matchCount"
    | "activities"
    | "firstTowerKills"
    | "firstTowerAssists"
    | "firstTowerParticipation"
  >();
  expectTypeOf<
    Exclude<
      keyof AnalysisDto,
      "target" | "selectedMatchIds" | "analyzedMatchIds"
    >
  >().toEqualTypeOf<Exclude<keyof AnalysisMatchInput, "matchId">>();
});
