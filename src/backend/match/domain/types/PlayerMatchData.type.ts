import type { GameMode } from "./GameMode.type";
import type { LaningSnapshot } from "./LaningSnapshot.type";
import type { MapId } from "./MapId.type";
import type { PlayerMatchStats } from "./PlayerMatchStats.type";
import type { Position } from "./Position.type";
import type { QueueId } from "./QueueId.type";
import type { Stat } from "./Stat.type";

/** @description 플레이어 경기 객체를 생성하거나 저장 데이터에서 복원할 때 사용하는 입력. 식별 키 외의 값은 원본 제공 상태를 명시한다. */
export type PlayerMatchData = Readonly<{
  /** @description 지역 접두사를 포함한 Riot 경기 식별자. puuid와 함께 플레이어 경기 기록을 구분한다. */
  matchId: string;
  /** @description Riot 플레이어 고유 식별자. 닉네임이 바뀌어도 같은 플레이어의 기록을 연결한다. */
  puuid: string;
  /** @description 솔로 랭크·자유 랭크 등 매칭 종류. 게임 규칙이나 맵과 별도인 분류다. */
  queueId: QueueId;
  /** @description 경기 시작 시각. 경기 진행 시간이 아닌 절대 시각이다. */
  startedAt: Stat<Date>;
  /** @description 플레이한 챔피언의 Riot 영문 이름. */
  champion: Stat<string>;
  /** @description Riot teamPosition 기준 역할. 칼바람은 확보된 NONE, 원본 누락은 NOT_PROVIDED, 미등록 역할은 UNKNOWN이다. */
  position: Stat<Position>;
  /** @description 이 플레이어가 속한 팀의 승리 여부. */
  win: Stat<boolean>;
  /** @description Riot 상세 응답의 숫자 경기 ID. 지역 접두사를 가진 matchId와 구분한다. */
  gameId: Stat<number>;
  /** @description CLASSIC·ARAM 등 게임 규칙. 매칭 종류인 queueId와 구분한다. */
  gameMode: Stat<GameMode>;
  /** @description 경기가 진행된 맵의 식별자. */
  mapId: Stat<MapId>;
  /** @description 경기가 진행된 게임 버전 문자열. 패치별 기록을 구분할 때 사용한다. */
  gameVersion: Stat<string>;
  /** @description 경기 진행 시간(초). */
  durationSeconds: Stat<number>;
  /** @description Riot의 경기 종료 결과. 분석 대상은 GameComplete인 기록만 포함한다. */
  endOfGameResult: Stat<string>;
  /** @description Riot의 초반 항복 종료 플래그. true 또는 미제공이면 분석에서 제외하며 다시하기와 동일하다고 단정하지 않는다. */
  gameEndedInEarlySurrender: Stat<boolean>;
  /** @description 일반 항복 종료 여부. true여도 이것만으로 분석에서 제외하지 않는다. */
  gameEndedInSurrender: Stat<boolean>;
  /** @description 플레이한 챔피언의 숫자 식별자. */
  championId: Stat<number>;
  /** @description 첫 번째 소환사 주문 슬롯의 주문 ID. */
  summoner1Id: Stat<number>;
  /** @description 두 번째 소환사 주문 슬롯의 주문 ID. */
  summoner2Id: Stat<number>;
  /** @description 이 플레이어의 경기 전체 선택 통계. 각 지표의 값 확보 상태를 함께 보존한다. */
  stats: PlayerMatchStats;
  /** @description 10분·15분의 본인 수치와 상대 격차. 표본이 없을 때도 해당 시점과 미제공·판별 불가 상태를 보존한다. */
  laningSnapshots: readonly LaningSnapshot[];
}>;
