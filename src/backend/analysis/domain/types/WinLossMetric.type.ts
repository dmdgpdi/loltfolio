import type { AnalysisMetric } from "./AnalysisMetric.type";

/** @description 승패 집단별 독립 표본의 평균과 승리 평균에서 패배 평균을 뺀 차이. 한 집단의 관측이 없으면 비교 불가다. */
export type WinLossMetric = Readonly<{
  wins: AnalysisMetric<number>;
  losses: AnalysisMetric<number>;
  difference:
    | Readonly<{ status: "AVAILABLE"; value: number }>
    | Readonly<{ status: "UNAVAILABLE" }>;
}>;
