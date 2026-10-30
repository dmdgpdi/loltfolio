import { emptyPlayerMatchStats } from "./emptyPlayerMatchStats";
import { freezeMatchValue } from "./freezeMatchValue";
import { Position as PositionValues } from "./Position";
import { resolveMatchPosition } from "./resolveMatchPosition";
import type { GameMode } from "./types/GameMode.type";
import type { LaningSnapshot } from "./types/LaningSnapshot.type";
import type { MapId } from "./types/MapId.type";
import type { PlayerMatchData } from "./types/PlayerMatchData.type";
import type { PlayerMatchStats } from "./types/PlayerMatchStats.type";
import type { Position } from "./types/Position.type";
import type { QueueId } from "./types/QueueId.type";
import type { Stat } from "./types/Stat.type";

/** @description 특정 플레이어 한 명의 경기 기록. 식별 키 외의 값은 확보·미제공·판별 불가 상태를 보존한다. */
export class PlayerMatch {
  /** @description 지역 접두사를 포함한 Riot 경기 식별자. puuid와 함께 플레이어 경기 기록을 구분한다. */
  readonly matchId: string;
  /** @description Riot 플레이어 고유 식별자. 닉네임이 바뀌어도 같은 플레이어의 기록을 연결한다. */
  readonly puuid: string;
  /** @description 솔로 랭크·자유 랭크 등 매칭 종류. 게임 규칙이나 맵과 별도인 분류다. */
  readonly queueId: QueueId;
  /** @description 플레이한 챔피언의 Riot 영문 이름. */
  readonly champion: Stat<string>;
  /** @description Riot teamPosition 기준 역할. 칼바람은 확보된 NONE이며, 미제공과 판별 불가는 각각 별도 상태로 구분한다. */
  readonly position: Stat<Position>;
  /** @description 이 플레이어가 속한 팀의 승리 여부. */
  readonly win: Stat<boolean>;
  /** @description Riot 상세 응답의 숫자 경기 ID. 지역 접두사를 가진 matchId와 구분한다. */
  readonly gameId: Stat<number>;
  /** @description CLASSIC·ARAM 등 게임 규칙. 매칭 종류인 queueId와 구분한다. */
  readonly gameMode: Stat<GameMode>;
  /** @description 경기가 진행된 맵의 식별자. */
  readonly mapId: Stat<MapId>;
  /** @description 경기가 진행된 게임 버전 문자열. 패치별 기록을 구분할 때 사용한다. */
  readonly gameVersion: Stat<string>;
  /** @description 경기 진행 시간(초). */
  readonly durationSeconds: Stat<number>;
  /** @description Riot의 경기 종료 결과. 분석 대상은 GameComplete인 기록만 포함한다. */
  readonly endOfGameResult: Stat<string>;
  /** @description Riot의 초반 항복 종료 플래그. true 또는 미제공이면 분석에서 제외하며 다시하기와 동일하다고 단정하지 않는다. */
  readonly gameEndedInEarlySurrender: Stat<boolean>;
  /** @description 일반 항복 종료 여부. true여도 이것만으로 분석에서 제외하지 않는다. */
  readonly gameEndedInSurrender: Stat<boolean>;
  /** @description 플레이한 챔피언의 숫자 식별자. */
  readonly championId: Stat<number>;
  /** @description 첫 번째 소환사 주문 슬롯의 주문 ID. */
  readonly summoner1Id: Stat<number>;
  /** @description 두 번째 소환사 주문 슬롯의 주문 ID. */
  readonly summoner2Id: Stat<number>;
  /** @description 이 플레이어의 경기 전체 선택 통계. 각 지표의 값 확보 상태를 함께 보존한다. */
  readonly stats: PlayerMatchStats;
  /** @description 10분·15분의 본인 수치와 상대 격차. 표본이 없을 때도 해당 시점과 미제공·판별 불가 상태를 보존한다. */
  readonly laningSnapshots: readonly LaningSnapshot[];
  /** @description 외부 Date 수정으로 시각이 변하지 않도록 Unix 밀리초와 상태를 보관한다. */
  private readonly startedAtMs: Stat<number>;

  /** @description 입력을 깊게 복사·동결하고 칼바람 포지션과 상대 비교 불가 규칙을 적용한다. */
  constructor(data: PlayerMatchData) {
    this.matchId = data.matchId;
    this.puuid = data.puuid;
    this.queueId = data.queueId;
    const startedAt = data.startedAt ?? { status: "NOT_PROVIDED" };
    this.startedAtMs = freezeMatchValue(
      startedAt.status === "AVAILABLE"
        ? { status: "AVAILABLE", value: startedAt.value.getTime() }
        : startedAt,
    );
    this.champion = freezeMatchValue(
      data.champion ?? { status: "NOT_PROVIDED" },
    );
    this.position = freezeMatchValue(resolveMatchPosition(data));
    this.win = freezeMatchValue(data.win ?? { status: "NOT_PROVIDED" });
    this.gameId = freezeMatchValue(data.gameId ?? { status: "NOT_PROVIDED" });
    this.gameMode = freezeMatchValue(
      data.gameMode ?? { status: "NOT_PROVIDED" },
    );
    this.mapId = freezeMatchValue(data.mapId ?? { status: "NOT_PROVIDED" });
    this.gameVersion = freezeMatchValue(
      data.gameVersion ?? { status: "NOT_PROVIDED" },
    );
    this.durationSeconds = freezeMatchValue(
      data.durationSeconds ?? { status: "NOT_PROVIDED" },
    );
    this.endOfGameResult = freezeMatchValue(
      data.endOfGameResult ?? { status: "NOT_PROVIDED" },
    );
    this.gameEndedInEarlySurrender = freezeMatchValue(
      data.gameEndedInEarlySurrender ?? { status: "NOT_PROVIDED" },
    );
    this.gameEndedInSurrender = freezeMatchValue(
      data.gameEndedInSurrender ?? { status: "NOT_PROVIDED" },
    );
    this.championId = freezeMatchValue(
      data.championId ?? { status: "NOT_PROVIDED" },
    );
    this.summoner1Id = freezeMatchValue(
      data.summoner1Id ?? { status: "NOT_PROVIDED" },
    );
    this.summoner2Id = freezeMatchValue(
      data.summoner2Id ?? { status: "NOT_PROVIDED" },
    );
    this.stats = freezeMatchValue(data.stats ?? emptyPlayerMatchStats());
    const canCompare =
      this.position.status === "AVAILABLE" &&
      this.position.value !== PositionValues.NONE;
    this.laningSnapshots = freezeMatchValue(
      ([10, 15] as const)
        .map(
          (minute) =>
            data.laningSnapshots?.find(
              (snapshot) => snapshot.minute === minute,
            ) ?? {
              minute,
              actualTimestampMs: { status: "NOT_PROVIDED" as const },
              own: { status: "NOT_PROVIDED" as const },
              opponentDifference: { status: "UNKNOWN" as const },
            },
        )
        .map((snapshot) => ({
          ...snapshot,
          opponentDifference: canCompare
            ? snapshot.opponentDifference
            : { status: "UNKNOWN" },
        })),
    );
    Object.freeze(this);
  }

  /** @description 종료 결과와 초반 항복 여부가 모두 확보되고 정상 완료·초반 항복 아님이 확인된 경기만 분석한다. */
  isEligibleForAnalysis(): boolean {
    return (
      this.endOfGameResult.status === "AVAILABLE" &&
      this.endOfGameResult.value === "GameComplete" &&
      this.gameEndedInEarlySurrender.status === "AVAILABLE" &&
      this.gameEndedInEarlySurrender.value === false
    );
  }

  /** @description 확보된 시작 시각은 매번 새로운 Date로 반환하고 미제공·판별 불가 상태는 그대로 보존한다. */
  get startedAt(): Stat<Date> {
    return this.startedAtMs.status === "AVAILABLE"
      ? { status: "AVAILABLE", value: new Date(this.startedAtMs.value) }
      : this.startedAtMs;
  }
}
