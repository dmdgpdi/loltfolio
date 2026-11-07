import type { Result } from "@praha/byethrow";
import type { AnalysisReadError } from "./errors/AnalysisReadError";
import type { AnalysisInputSet } from "./types/AnalysisInputSet.type";
import type { AnalysisTarget } from "./types/AnalysisTarget.type";

/** @description 저장 경기와 분석 소유 입력 사이의 읽기 전용 변환 경계. Riot 조회·저장·수집 상태 변경은 수행하지 않는다. */
export interface AnalysisInputReader {
  /** @description 최신 성공·부분 성공 수집의 ID 범위만 읽는다. 완료 표본이 없으면 null, 완료된 빈 표본이면 빈 집합, 조회 실패면 오류다. 진행·실패 시도는 이전 완료 표본을 대체하지 않는다. */
  findLatest(
    target: AnalysisTarget,
  ): Promise<Result.Result<AnalysisInputSet | null, AnalysisReadError>>;
}
