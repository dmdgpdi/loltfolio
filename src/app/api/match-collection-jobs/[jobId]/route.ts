import { getMatchCollectionController } from "@/backend/match/composition/getMatchCollectionController";

/** @description 동적 경로를 해석해 저장된 작업 상태만 조회한다. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const { jobId } = await context.params;
  return getMatchCollectionController().get(jobId);
}
