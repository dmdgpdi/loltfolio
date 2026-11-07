import { Result } from "@praha/byethrow";
import { QueueId } from "../../match/domain/QueueId";
import type { AnalysisReader } from "../application/AnalysisReader";
import { AnalysisReadError } from "../application/errors/AnalysisReadError";
import type { AnalysisTarget } from "../application/types/AnalysisTarget.type";
import type { AnalysisHttpError } from "./AnalysisHttpError.type";

/** @description 조회 인자를 검증하고 Query 결과를 HTTP 응답으로 변환하며 수집을 시작하지 않는다. */
export class AnalysisController {
  /** @description 조회 Application 계약만 주입받아 HTTP 계층에 DB 구현을 노출하지 않는다. */
  constructor(private readonly reader: AnalysisReader) {}

  /** @description 완료 표본 부재와 입력·조회·계산 실패를 구분해 캐시 없는 응답을 반환한다. */
  async get(request: Request): Promise<Response> {
    try {
      const target = parseTarget(request);

      if (target === null) {
        return errorResponse(
          400,
          "INVALID_ANALYSIS_QUERY",
          "puuid와 지원하는 queueId를 각각 한 번 지정해야 합니다.",
        );
      }

      const result = await this.reader.findLatest(target);

      if (Result.isFailure(result)) {
        return result.error instanceof AnalysisReadError
          ? errorResponse(
              503,
              "ANALYSIS_READ_FAILED",
              "분석 대상 경기를 조회할 수 없습니다.",
            )
          : errorResponse(
              500,
              "ANALYSIS_CALCULATION_FAILED",
              "분석을 계산할 수 없습니다.",
            );
      }

      if (result.value === null) {
        return errorResponse(
          404,
          "ANALYSIS_NOT_FOUND",
          "완료된 분석 대상 경기 정보가 없습니다.",
        );
      }

      return Response.json(result.value, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch {
      return errorResponse(
        500,
        "INTERNAL_ERROR",
        "분석 조회를 처리할 수 없습니다.",
      );
    }
  }
}

/** @description 식별자를 임의 보정하거나 중복 인자를 묵인하지 않고 기존 지원 QueueId로 좁힌다. */
function parseTarget(request: Request): AnalysisTarget | null {
  const parameters = new URL(request.url).searchParams;
  const puuids = parameters.getAll("puuid");
  const queues = parameters.getAll("queueId");
  const puuid = puuids[0];
  const queueId = Object.values(QueueId).find((id) => String(id) === queues[0]);

  if (
    puuids.length !== 1 ||
    queues.length !== 1 ||
    !puuid ||
    puuid.trim() !== puuid ||
    queueId === undefined
  ) {
    return null;
  }

  return { puuid, queueId };
}

/** @description 오류 응답도 캐시하지 않고 상세 원인이나 원본 예외를 본문에 포함하지 않는다. */
function errorResponse(
  status: number,
  code: AnalysisHttpError["error"]["code"],
  message: string,
): Response {
  const body: AnalysisHttpError = { error: { code, message } };
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
