import { Result } from "@praha/byethrow";
import type { CompletedMatchReader } from "../../../match/application/CompletedMatchReader";
import type { AnalysisInputReader } from "../../application/AnalysisInputReader";
import { AnalysisReadError } from "../../application/errors/AnalysisReadError";
import type { AnalysisInputSet } from "../../application/types/AnalysisInputSet.type";
import type { AnalysisTarget } from "../../application/types/AnalysisTarget.type";
import { toAnalysisMatchInput } from "./toAnalysisMatchInput";

/** @description match의 공개 읽기 계약을 분석 소유 입력으로 변환하며 DB와 Riot 구현에 직접 의존하지 않는다. */
export class StoredAnalysisInputReader implements AnalysisInputReader {
  /** @description 수집·저장 기능이 없는 공개 Reader만 주입받는다. */
  constructor(private readonly matches: CompletedMatchReader) {}

  /** @description 완료 표본 없음과 정상 빈 표본을 구분하고 원천 조회 실패를 Application 오류로 보존한다. */
  async findLatest(
    target: AnalysisTarget,
  ): Promise<Result.Result<AnalysisInputSet | null, AnalysisReadError>> {
    const result = await this.matches.findLatest(target.puuid, target.queueId);

    if (Result.isFailure(result)) {
      return Result.fail(new AnalysisReadError({ cause: result.error }));
    }

    if (result.value === null) {
      return Result.succeed(null);
    }

    const source = result.value;
    return Result.try({
      try: () =>
        Object.freeze({
          selectedMatchIds: Object.freeze([...source.selectedMatchIds]),
          matches: Object.freeze(source.matches.map(toAnalysisMatchInput)),
        }),
      catch: (cause) => new AnalysisReadError({ cause }),
    });
  }
}
