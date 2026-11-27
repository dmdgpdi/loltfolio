import { getMatchCollectionController } from "@/backend/match/composition/getMatchCollectionController";

/** @description 수집 완료 대신 작업 접수 결과를 반환한다. */
export function POST(request: Request): Promise<Response> {
  return getMatchCollectionController().post(request);
}
