import type { AnalysisMatchInput } from "./AnalysisMatchInput.type";

/** @description 최신 완료 수집의 ID 범위와 그 안에서 확보한 분석 대상 입력. 빈 결과와 조회 부재를 구분한다. */
export type AnalysisInputSet = Readonly<{
  /** @description 최신 최대 20개 ID의 중복 없는 원래 순서. 실패·분석 제외 경기도 이 범위에는 남으며 과거 ID를 보충하지 않는다. */
  selectedMatchIds: readonly string[];
  /** @description 해당 범위에 속한 저장·분석 가능한 경기만 같은 순서로 반환한다. matchId는 중복되지 않는다. */
  matches: readonly AnalysisMatchInput[];
}>;
