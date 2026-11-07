import { Result } from "@praha/byethrow";
import { analyzeAllyProtectionStyle } from "../domain/analyzeAllyProtectionStyle";
import { analyzeChampionPreference } from "../domain/analyzeChampionPreference";
import { analyzeComebackStyle } from "../domain/analyzeComebackStyle";
import { analyzeCrowdControlStyle } from "../domain/analyzeCrowdControlStyle";
import { analyzeDamageTakenStyle } from "../domain/analyzeDamageTakenStyle";
import { analyzeEnemyTowerKillStyle } from "../domain/analyzeEnemyTowerKillStyle";
import { analyzeJungleStyle } from "../domain/analyzeJungleStyle";
import { analyzeLaningStyle } from "../domain/analyzeLaningStyle";
import { analyzeOutnumberedKillStyle } from "../domain/analyzeOutnumberedKillStyle";
import { analyzeOwnTowerKillStyle } from "../domain/analyzeOwnTowerKillStyle";
import { analyzeSkillshotDodgeStyle } from "../domain/analyzeSkillshotDodgeStyle";
import { analyzeSurvivalStyle } from "../domain/analyzeSurvivalStyle";
import { analyzeWinLossComparison } from "../domain/analyzeWinLossComparison";
import { CommunicationStyle } from "../domain/CommunicationStyle";
import { FirstBloodStyle } from "../domain/FirstBloodStyle";
import { PositionDistribution } from "../domain/PositionDistribution";
import { SoloKillStyle } from "../domain/SoloKillStyle";
import { StructureStyle } from "../domain/StructureStyle";
import { VisionStyle } from "../domain/VisionStyle";
import type { AnalysisInputReader } from "./AnalysisInputReader";
import type { AnalysisReader } from "./AnalysisReader";
import { AnalysisCalculationError } from "./errors/AnalysisCalculationError";
import type { AnalysisReadError } from "./errors/AnalysisReadError";
import type { AnalysisDto } from "./types/AnalysisDto.type";
import type { AnalysisMatchInput } from "./types/AnalysisMatchInput.type";
import type { AnalysisTarget } from "./types/AnalysisTarget.type";

/** @description 저장 경기 입력과 순수 도메인 계산으로 DTO를 반환하며 수집·저장 경계에 의존하지 않는다. */
export class CalculatedAnalysisReader implements AnalysisReader {
  /** @description 쓰기 기능이 없는 입력 Reader만 외부에서 주입받는다. */
  constructor(private readonly inputs: AnalysisInputReader) {}

  /** @description 완료 표본 부재와 빈 표본을 구분하고 매 조회마다 같은 도메인 규칙으로 계산한다. */
  async findLatest(
    target: AnalysisTarget,
  ): Promise<
    Result.Result<
      AnalysisDto | null,
      AnalysisReadError | AnalysisCalculationError
    >
  > {
    const input = await this.inputs.findLatest(target);

    if (Result.isFailure(input)) {
      return input;
    }

    if (input.value === null) {
      return Result.succeed(null);
    }

    const basics = calculateBasics(input.value.matches);
    const combat = calculateCombat(input.value.matches);
    const support = calculateSupport(input.value.matches);

    if (Result.isFailure(basics)) {
      return basics;
    }

    if (Result.isFailure(combat)) {
      return combat;
    }

    if (Result.isFailure(support)) {
      return support;
    }

    return Result.succeed(
      Object.freeze({
        target: Object.freeze({ ...target }),
        selectedMatchIds: Object.freeze([...input.value.selectedMatchIds]),
        analyzedMatchIds: Object.freeze(
          input.value.matches.map(({ matchId }) => matchId),
        ),
        ...basics.value,
        ...combat.value,
        ...support.value,
      }),
    );
  }
}

/** @description 기존 클래스 성향은 명시적인 데이터 필드만 DTO로 투영하여 메서드나 내부 상태를 노출하지 않는다. */
function calculateBasics(records: readonly AnalysisMatchInput[]) {
  const results = resolve({
    communication: CommunicationStyle.analyze(
      records.map((record) => record.communication),
    ),
    vision: VisionStyle.analyze(records.map((record) => record.vision)),
    structure: StructureStyle.analyze(
      records.map((record) => record.structure),
    ),
    soloKill: SoloKillStyle.analyze(records.map((record) => record.soloKill)),
    firstBlood: Result.succeed(
      FirstBloodStyle.analyze(records.map((record) => record.firstBlood)),
    ),
    position: PositionDistribution.analyze(
      records.map((record) => record.position),
    ),
  });
  return Result.pipe(
    results,
    Result.map((values) =>
      Object.freeze({
        position: Object.freeze({ ...values.position }),
        communication: Object.freeze({
          matchCount: values.communication.matchCount,
          pings: values.communication.pings,
        }),
        vision: Object.freeze({
          matchCount: values.vision.matchCount,
          activities: values.vision.activities,
        }),
        structure: Object.freeze({
          matchCount: values.structure.matchCount,
          activities: values.structure.activities,
          firstTowerKills: values.structure.firstTowerKills,
          firstTowerAssists: values.structure.firstTowerAssists,
          firstTowerParticipation: values.structure.firstTowerParticipation,
        }),
        soloKill: Object.freeze({
          matchCount: values.soloKill.matchCount,
          soloKills: values.soloKill.soloKills,
          share: values.soloKill.share,
        }),
        firstBlood: Object.freeze({
          matchCount: values.firstBlood.matchCount,
          kills: values.firstBlood.kills,
          assists: values.firstBlood.assists,
          participation: values.firstBlood.participation,
        }),
      }),
    ),
  );
}

/** @description 전투·성장별로 정의한 표본 범위와 계산 규칙을 그대로 사용한다. */
function calculateCombat(records: readonly AnalysisMatchInput[]) {
  return resolve({
    jungle: analyzeJungleStyle(records.map((record) => record.jungle)),
    laning: analyzeLaningStyle(records.map((record) => record.laning)),
    comeback: analyzeComebackStyle(records.map((record) => record.comeback)),
    outnumberedKill: analyzeOutnumberedKillStyle(
      records.map((record) => record.outnumberedKill),
    ),
    enemyTowerKill: analyzeEnemyTowerKillStyle(
      records.map((record) => record.enemyTowerKill),
    ),
    ownTowerKill: analyzeOwnTowerKillStyle(
      records.map((record) => record.ownTowerKill),
    ),
    skillshotDodge: analyzeSkillshotDodgeStyle(
      records.map((record) => record.skillshotDodge),
    ),
  });
}

/** @description 지원·선택·승패 지표를 계산하고 서로 다른 단위나 표본을 합치지 않는다. */
function calculateSupport(records: readonly AnalysisMatchInput[]) {
  return resolve({
    damageTaken: analyzeDamageTakenStyle(
      records.map((record) => record.damageTaken),
    ),
    survival: analyzeSurvivalStyle(records.map((record) => record.survival)),
    allyProtection: analyzeAllyProtectionStyle(
      records.map((record) => record.allyProtection),
    ),
    crowdControl: analyzeCrowdControlStyle(
      records.map((record) => record.crowdControl),
    ),
    championPreference: analyzeChampionPreference(
      records.map((record) => record.championPreference),
    ),
    winLoss: analyzeWinLossComparison(records.map((record) => record.winLoss)),
  });
}

/** @description 도메인 입력 오류를 원인과 함께 Query 계산 오류로 반환한다. 정상 UNAVAILABLE 지표는 실패가 아니다. */
function resolve<T extends object>(
  results: { [K in keyof T]: Result.Result<T[K], unknown> },
): Result.Result<T, AnalysisCalculationError> {
  const values: [string, unknown][] = [];

  for (const [key, result] of Object.entries(results) as [
    string,
    Result.Result<unknown, unknown>,
  ][]) {
    if (Result.isFailure(result)) {
      return Result.fail(new AnalysisCalculationError({ cause: result.error }));
    }

    values.push([key, result.value]);
  }

  // 각 입력 키에 대응하는 성공 값만 같은 키로 모은다.
  return Result.succeed(Object.freeze(Object.fromEntries(values)) as T);
}
