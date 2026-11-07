import type { Result } from "@praha/byethrow";
import type { AnalysisCalculationError } from "./errors/AnalysisCalculationError";
import type { AnalysisReadError } from "./errors/AnalysisReadError";
import type { AnalysisDto } from "./types/AnalysisDto.type";
import type { AnalysisTarget } from "./types/AnalysisTarget.type";

/** @description 저장 경기의 순수 도메인 계산으로 DTO를 제공하는 Query 계약. 수집·저장·자동 생성·최신화는 수행하지 않는다. */
export interface AnalysisReader {
  /** @description 완료 표본이 없으면 null, 표본이 비어 있으면 계산 불가 지표를 포함한 DTO를 반환한다. 조회·계산 실패는 각각 오류로 반환하며 분석 결과 스냅샷을 저장하지 않는다. */
  findLatest(
    target: AnalysisTarget,
  ): Promise<
    Result.Result<
      AnalysisDto | null,
      AnalysisReadError | AnalysisCalculationError
    >
  >;
}
