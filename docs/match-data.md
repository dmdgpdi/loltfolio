# 경기 수집과 저장

`MatchCollectionService`는 `(puuid, queueId)`별 최근 경기 ID를 최대 20개 한 번 조회하고, 확보한 유효 기록을 반환한다. 정확히 20개의 유효 경기를 채우기 위해 과거 페이지를 추가 조회하지 않는다. DB에 있는 기록은 그대로 재사용하며, 기존 불완전 기록을 다시 조회해 보완하는 작업은 이 수집의 범위가 아니다.

## 저장 범위

조회한 플레이어 한 명의 선택 필드만 저장한다. 원본 DTO와 나머지 9명의 통계는 저장하지 않는다.

| 테이블/필드 | 저장 내용 |
| --- | --- |
| `match_syncs` | 플레이어·큐별 수집 상태와 마지막 시도·성공·재시도 시각 |
| `player_matches` 기본 컬럼 | 경기/플레이어 ID, 큐, 맵, 모드, 패치, 시작·진행 시간, 종료 정보, 챔피언, 포지션, 승패, 소환사 주문 |
| `player_matches.stats` | 핑·시야·전투·라인전·정글·오브젝트·생존·지원의 선택 통계, 타입이 지정된 JSONB |
| `player_matches.laning_snapshots` | Timeline의 10분·15분 본인 수치 및 같은 포지션 상대와의 차이, JSONB |

통계 필드의 기준은 [PlayerMatchStats.type.ts](../src/backend/match/domain/types/PlayerMatchStats.type.ts), 외부 필드 대응은 [toPlayerMatchStats.ts](../src/backend/match/infrastructure/riot/toPlayerMatchStats.ts)다. 원본 전체를 JSONB에 복사하는 방식이 아니다.

통계는 `Stat<T>`로 저장한다. 원본 값이 있으면 `{ status: "AVAILABLE", value }`, 원본 값이 없으면 `{ status: "NOT_PROVIDED" }`, 계산·판별이 불가능하면 `{ status: "UNKNOWN" }`이다. 원본의 필드 누락과 명시적 `null`은 모두 `NOT_PROVIDED`이며 `UNKNOWN`으로 추정하지 않는다. 실제 0·false·소수·음수도 AVAILABLE 값으로 보존한다. 현재 선택 통계는 원본을 옮기는 값이므로 수집 과정에서 UNKNOWN을 생성하지 않는다. 이후 분석에서는 지표마다 AVAILABLE인 경기 수만 분모로 사용한다. 합계·평균·최소·최대·승패별 집계는 저장된 경기들을 입력으로 계산하며, 리포트 Entity는 추가하지 않는다.

기존 DB의 원시 숫자·불리언과 null은 읽을 때 각각 AVAILABLE·NOT_PROVIDED로 복원한다. 새로 저장하는 통계는 상태를 포함한 JSONB를 사용한다. 경기 기본 정보는 기존 SQL 컬럼에 확보된 값만 저장하고, 미제공·판별 불가는 `field_states` JSONB에 별도로 저장한다. SQL NULL만으로 두 상태를 구분하지 않는다. 추가 마이그레이션은 상태 컬럼을 추가하고 시작 시각·챔피언·승패의 NOT NULL 제약을 해제한다. 기존 행의 값을 일괄 변환하지 않는다.

핑은 각각 저장한다. 두 적 정글 지표도 각각 저장하며 합산하거나 대체하지 않는다. `earlyLaningPhaseGoldExpAdvantage`, `laningPhaseGoldExpAdvantage`는 제공된 수치를 보존하되 골드 격차로 표시하지 않는다.

## 매칭 종류·게임 규칙·맵·포지션

- `QueueId`: 솔로 랭크·자유 랭크·일반·격전 등의 매칭 종류.
- `GameMode`: `CLASSIC`, `ARAM`, `SWIFTPLAY` 등의 실제 게임 규칙. 제공 상태는 `Stat<GameMode>`로 구분한다.
- `MapId`: 소환사의 협곡(`11`), 칼바람 나락(`12`) 등의 맵.
- `Position`: `teamPosition`의 `TOP`, `JUNGLE`, `MIDDLE`, `BOTTOM`, `UTILITY`와 포지션 없음인 `NONE`. 칼바람 게임 규칙·맵·큐(격전 포함) 중 하나라도 확인되면 도메인 생성·DB 복원과 API 파싱에서 `AVAILABLE(Position.NONE)`으로 정규화한다. 이는 원본 미제공이나 판별 불가와 다르며 상대 비교에서는 제외한다.

상수는 각각 `match/domain/QueueId.ts`, `GameMode.ts`, `MapId.ts`, `Position.ts`에 두고, 값의 유니온 타입은 `domain/types/`의 같은 이름의 `.type.ts` 파일로 분리한다. 게임 규칙·맵·포지션의 누락・null・빈 문자열은 NOT_PROVIDED, 자료형은 맞지만 미등록인 값은 UNKNOWN이다. 숫자 포지션 등 잘못된 자료형은 응답 오류다. DB 복원 시에도 같은 검증을 적용한다.

`matchId`·`puuid`·`queueId`는 기록의 식별·수집 키이므로 필수다. 이외의 `gameId`, 맵, 게임 버전, 시작 시각, 경기 시간, 챔피언·주문 ID, 승패, 종료 결과·항복 플래그는 모두 `Stat<T>`로 제공 상태를 명시한다. 값이 없다고 0·false·현재 시각 등의 값을 만들어 넣거나 수집 전체를 거부하지 않는다. 단, 잘못된 자료형·NaN 등은 미제공으로 숨기지 않고 오류로 반환한다.

예를 들어 솔로 랭크는 `QueueId.RANKED_SOLO_DUO`, 게임 규칙은 `GameMode.CLASSIC`, 맵은 `MapId.SUMMONERS_RIFT`로 각각 표현한다.

## 분석 대상과 시간 표본

- 종료 결과와 초반 항복 여부가 모두 AVAILABLE이고, 값이 각각 `GameComplete`와 `false`일 때만 분석에 포함한다. NOT_PROVIDED·UNKNOWN인 종료 정보는 정상 완료로 간주하지 않는다.
- 일반 항복 여부인 `gameEndedInSurrender`는 제외 조건이 아니다. 임의의 최소 경기 시간은 적용하지 않는다.
- `gameEndedInEarlySurrender`가 다시하기와 정확히 같은 의미라고 단정하지 않는다. 현재는 이 플래그가 켜진 경기를 제외하는 명시적인 정책이다.
- 제외 경기의 판정 정보도 저장하여 다음 수집에서 같은 상세 조회를 반복하지 않는다.
- Timeline에서 목표 시각과 가장 가까운 프레임을 사용하되, 허용 오차는 5초다. `actualTimestampMs`에 실제 시각을 저장하고 보간하지 않는다.
- 10·15분 항목은 항상 보존한다. 해당 시각 전에 끝났거나 허용 범위에 프레임이 없으면 실제 시각과 본인 표본은 NOT_PROVIDED다. 본인 프레임이 없거나 개별 원본 수치가 없을 때도 해당 부분을 NOT_PROVIDED로 남긴다.
- 비교 상대는 확보된 포지션과 같은 상대 팀의 `teamPosition`이 유일할 때만 선택한다. 이 값은 라인 위치를 직접 추적한 결과가 아니다. 포지션이 NONE·미제공·판별 불가이거나 상대를 정할 수 없으면 `opponentDifference`는 UNKNOWN이다. 양쪽 표본 중 개별 수치가 누락되면 그 수치의 차이는 UNKNOWN이며, 나머지 수치는 계산한다.
- 차이는 본인에서 상대를 뺀 골드·경험치·레벨·라인 CS·정글 CS다. `maxCsAdvantageOnLaneOpponent`는 이 시점별 CS 차이와 별도 지표다.

## 실행과 실패 처리

`.env`의 `LOL_API_KEY`, `LOL_MATCH_REGION`을 사용한다. 지역 기본값은 `ASIA`이며 `AMERICAS`, `EUROPE`, `SEA`도 지원한다. 지역은 Riot ID 태그에서 추론하지 않는다.

스키마 적용은 저장소 루트에서 검토된 마이그레이션을 `pnpm run db:migrate`로 적용한다. 이 명령은 주입된 `DATABASE_URL`을 우선 사용한다.

DB에 없는 경기는 한 수집 안에서 최대 두 개씩 병렬 조회한다. 상세와 Timeline은 경기별로 순서대로 요청하며, 결과는 응답 완료 순서가 아닌 Riot ID 목록의 순서로 반환한다. 두 개라는 값은 동시 실행 수를 작게 제한하기 위한 선택이며 Riot의 키·메서드별 시간 구간 호출 한도를 보장하지 않는다.

개별 404·5xx·타임아웃·통신 실패는 건너뛰고 다른 경기 조회를 계속한다. 확보한 신규 기록은 분석 제외 경기의 판정 정보까지 함께 저장한다. 일부 조회 실패가 있으면 `PARTIALLY_SUCCEEDED`, 전부 확인했으면 `SUCCEEDED`로 기록한다. 두 상태 모두 최신화 성공 시각부터 기존 20분 제한을 적용한다. 빈 목록은 정상 성공이지만, 요청한 모든 경기 조회가 실패하고 재사용할 DB 기록도 없으면 `FAILED`다.

목록 조회·DB 오류, 인증·설정·응답 검증 오류와 429는 수집 실패다. 중단 오류가 나면 진행 중인 상세·Timeline에 취소 신호를 전달하고 다음 묶음을 시작하지 않는다. 중단 이전에 확보한 기록은 저장하며, 429의 `Retry-After`는 `MatchSync.retryAvailableAt`에 보존한다. 자동 재시도는 하지 않는다. 다음 최신화에서는 성공 저장분을 재사용하고 아직 없는 경기만 요청한다. DB 저장까지 실패하면 저장 오류를 반환하고, 원래 API 중단 오류가 함께 있었다면 두 오류를 함께 보존한다.

DB의 조건부 UPSERT로 같은 플레이어·큐의 중복 시작과 전체·부분 성공 후 20분 제한을 보장한다. 완료 저장은 같은 `lastAttemptAt`의 진행 중 작업에만 허용한다. 프로세스 강제 종료로 남은 `IN_PROGRESS` 상태의 자동 복구 정책은 아직 없다.

## 검증

일반 테스트 외 DB 통합 테스트는 `MATCH_DB_TEST_URL`을 지정해 `pnpm exec vitest run src/backend/match/infrastructure/persistence/repositories.integration.spec.ts`로 실행한다. 로컬 PostgreSQL 주소만 허용하며, 임시 스키마에 마이그레이션을 적용한 뒤 삭제한다. 환경 변수가 없으면 DB 테스트는 건너뛴다.
