import { Result } from "@praha/byethrow";
import { z } from "zod";
import { InvalidMatchCollectionCommandError } from "@/backend/match/application/errors/InvalidMatchCollectionCommandError";
import { MatchCollectionAdmissionRejectedError } from "@/backend/match/application/errors/MatchCollectionAdmissionRejectedError";
import { MatchCollectionJobPersistenceError } from "@/backend/match/application/errors/MatchCollectionJobPersistenceError";
import type { MatchCollectionJobReader } from "@/backend/match/application/MatchCollectionJobReader";
import type { RequestMatchCollection } from "@/backend/match/application/RequestMatchCollection";
import { QueueId } from "@/backend/match/domain/QueueId";
import type { QueueId as QueueIdValue } from "@/backend/match/domain/types/QueueId.type";

const targetSchema = z.object({
  puuid: z
    .string()
    .min(1)
    .refine((value) => value === value.trim()),
  queueId: z.custom<QueueIdValue>((value) =>
    Object.values(QueueId).some((id) => id === value),
  ),
});

/** @description HTTP 입력을 검증하고 작업 접수·순수 상태 조회를 캐시 없는 응답으로 변환한다. */
export class MatchCollectionController {
  /** @description HTTP 처리에는 Application 계약만 주입한다. */
  constructor(
    private readonly command: Pick<RequestMatchCollection, "execute">,
    private readonly reader: MatchCollectionJobReader,
  ) {}

  /** @description 명령 접수만 기다린 뒤 새 작업·기존 작업 공유 모두 상태 조회 위치와 함께 202로 응답한다. */
  async post(request: Request): Promise<Response> {
    try {
      const input = await parseBody(request);
      if (!input.success)
        return errorResponse(400, "INVALID_COLLECTION_COMMAND");
      const result = await this.command.execute(input.data);
      if (Result.isFailure(result)) return commandError(result.error);
      return Response.json(result.value, {
        status: 202,
        headers: {
          "Cache-Control": "no-store",
          Location: `/api/match-collection-jobs/${encodeURIComponent(result.value.jobId)}`,
        },
      });
    } catch {
      return errorResponse(500, "INTERNAL_ERROR");
    }
  }

  /** @description 작업의 실패는 200 상태 DTO로 반환하고 부재·조회 장애와 구분한다. 수집은 시작하지 않는다. */
  async get(jobId: string): Promise<Response> {
    try {
      const result = await this.reader.findById(jobId);
      if (Result.isFailure(result)) {
        if (result.error instanceof InvalidMatchCollectionCommandError)
          return errorResponse(400, "INVALID_COLLECTION_QUERY");
        return result.error instanceof MatchCollectionJobPersistenceError
          ? errorResponse(503, "COLLECTION_READ_FAILED")
          : errorResponse(500, "INTERNAL_ERROR");
      }
      return result.value === null
        ? errorResponse(404, "COLLECTION_JOB_NOT_FOUND")
        : Response.json(result.value, {
            headers: { "Cache-Control": "no-store" },
          });
    } catch {
      return errorResponse(500, "INTERNAL_ERROR");
    }
  }
}

/** @description JSON 문법 오류를 입력 오류로 다루고 런타임 입력을 기존 대상 타입으로 좁힌다. */
async function parseBody(request: Request) {
  try {
    return targetSchema.safeParse(await request.json());
  } catch {
    return { success: false } as const;
  }
}

/** @description 접수 거절의 재요청 시각만 노출하고 저장소 원본 오류는 숨긴다. */
function commandError(error: unknown): Response {
  if (error instanceof InvalidMatchCollectionCommandError)
    return errorResponse(400, "INVALID_COLLECTION_COMMAND");
  if (error instanceof MatchCollectionAdmissionRejectedError)
    return errorResponse(409, error.code, error.retryAvailableAt.toISOString());
  return error instanceof MatchCollectionJobPersistenceError
    ? errorResponse(503, "COLLECTION_ADMISSION_FAILED")
    : errorResponse(500, "INTERNAL_ERROR");
}

/** @description 오류 응답도 캐시하지 않으며 원본 예외·실행 권한은 포함하지 않는다. */
function errorResponse(
  status: number,
  code: string,
  retryAvailableAt?: string,
): Response {
  return Response.json(
    {
      error: {
        code,
        ...(retryAvailableAt === undefined ? {} : { retryAvailableAt }),
      },
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
