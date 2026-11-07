import { getDatabase } from "../../db/client";
import { DrizzleCompletedMatchReader } from "../../match/infrastructure/persistence/DrizzleCompletedMatchReader";
import type { AnalysisReader } from "../application/AnalysisReader";
import { CalculatedAnalysisReader } from "../application/CalculatedAnalysisReader";
import { StoredAnalysisInputReader } from "../infrastructure/match/StoredAnalysisInputReader";
import { AnalysisController } from "../presentation/AnalysisController";

let controller: AnalysisController | undefined;
let reader: AnalysisReader | undefined;

/** @description 조회 객체를 모듈당 한 번 조립한다. 입력 검증 전에는 DB 설정·연결을 요구하지 않도록 실제 Reader 초기화를 지연한다. */
export function getAnalysisController(): AnalysisController {
  controller ??= new AnalysisController({
    findLatest: async (target) => {
      reader ??= new CalculatedAnalysisReader(
        new StoredAnalysisInputReader(
          new DrizzleCompletedMatchReader(getDatabase()),
        ),
      );
      return reader.findLatest(target);
    },
  });
  return controller;
}
