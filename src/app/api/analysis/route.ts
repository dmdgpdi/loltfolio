import { getAnalysisController } from "../../../backend/analysis/composition/getAnalysisController";

/** @description 저장 경기의 분석 결과만 조회하며 최초 수집·최신화 같은 Command를 실행하지 않는다. */
export function GET(request: Request): Promise<Response> {
  return getAnalysisController().get(request);
}
