# 현재 진행 상황과 다음 작업

기준일: 2026-11-07. 완료 이력 대신 현재 상태와 다음 작업을 유지한다.

## 구현 완료

| 영역 | 현재 상태 |
| --- | --- |
| 플레이어 | Riot ID 검증·PUUID 조회와 오류 처리. 플레이어 DB 저장은 없음 |
| 경기 수집 | 최신 ID 최대 20개를 한 번 조회, DB 재사용, 누락 경기 최대 2개 병렬 요청 |
| 저장·수집 제어 | 경기·통계·Timeline 저장, 원자적 시작·완료, 부분 성공, 20분 제한, 429 재시도 시각 |
| 완료 표본 | 원래 ID 목록 보존. 진행·실패·완료 저장 실패 시 이전 목록 유지, 과거 경기로 보충하지 않음 |
| 분석 | 19개 개념의 입력·결과·순수 계산·검증·동결·테스트, 저장 경기 매핑과 DTO 조회 |
| HTTP | `GET /api/analysis?puuid=…&queueId=420`, Controller와 지연 초기화 Composition root |
| 지침 | Backend AGENTS에 Presentation의 HTTP 처리와 Composition의 객체 조립·생성자 주입 명시 |

화면은 `Home`이 null을 반환하는 초기 상태다. 검색·최초 생성·최신화 Command와 화면 연결은 미구현이다.

## 유지할 경계

- Domain은 비즈니스 규칙, Application은 유스케이스, Infrastructure는 DB·외부 API를 담당한다. Presentation은 HTTP 변환, Composition은 실제 구현체 조립이다. Controller·서비스는 인프라를 직접 생성하지 않는다.
- 분석 도메인은 match·DB·HTTP에 의존하지 않는다. match의 공개 Application Reader를 분석 Adapter에서 사용한다.
- Query는 저장 경기를 읽고 순수 계산한 DTO만 반환한다. Riot 수집·저장·자동 생성은 Command로 분리한다. 분석 결과 스냅샷은 저장하지 않는다.
- 실제 0·false, 미제공, 판별 불가, 입력 오류를 구분한다. 계산은 지표별 유효 표본 1경기부터 허용하며 표본 수를 보존한다.

## 다음 작업 순서

1. 플레이어 식별과 최초 생성·명시적 최신화 Command를 조율하고 API에 연결한다. 요청·응답, 재시도 시각·부분 성공, 동시 요청, 제한 중 동작을 정한다. 기존 권장 이름은 `GetOrCreatePlayStyleCommand`·`RefreshPlayStyleCommand`이며 계약은 미확정이다.
2. 수집 성공 후 분석 실패 시 재수집 없이 Query로 재분석하는 흐름을 연결한다. 수집 성공과 분석 성공을 구분한다.
3. 초기 카드·표시 단위·반올림·노출 기준을 정하고 검색·결과·최신화 화면을 연결한다. 보류한 챔피언 역할 분류·임의 임계값은 추가하지 않는다.
4. 공개 범위에 맞춰 남은 IN_PROGRESS 복구·Riot 전역 호출량 제어·기존 불완전 기록 보완을 별도 설계한다. 플레이어 저장·Riot ID 변경 대응은 필요한 유스케이스가 확인되면 정한다.

## 환경과 검증

- 완료 ID 컬럼 마이그레이션은 생성·검토했고 로컬 임시 스키마에서 검증했다. **앱 DB에는 미적용**이다. 대상 환경 적용 후 실제 저장 데이터의 HTTP 조회를 확인해야 한다.
- fmt·lint 통과, 린트 진단 없음. 일반 테스트 716개 통과. DB 테스트 14개는 별도 로컬 임시 스키마에서 통과했으며 일반 실행에서는 MATCH_DB_TEST_URL 미설정으로 생략한다.
- TypeScript·Webpack 프로덕션 빌드와 로컬 HTTP 400/no-store 검증 통과. 기본 Turbopack 빌드는 CSS 처리 중 내부 포트 바인딩 EPERM으로 실패했다. 설정은 변경하지 않았다.

## 필요한 문서만 읽기

- 카드·원천·계산·보류 정책: [분석 콘텐츠](analysis-content.md)
- Reader·DTO·계층 연결·조회 HTTP 계약: [분석 입력과 Query 조회 계약](analysis-read-contracts.md)
- 수집·저장·표본·마이그레이션 검증: [경기 수집과 저장](match-data.md)

작업 규칙과 검증 명령은 루트·백엔드 AGENTS.md를 따른다. 완료 항목은 남은 작업에서 제거하고 상세 정책은 해당 문서 한 곳에서 관리한다.
