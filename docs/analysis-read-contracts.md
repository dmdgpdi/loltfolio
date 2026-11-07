# 분석 입력과 Query 조회 계약

## 책임과 연결

Query는 저장 경기에서 순수 계산한 DTO를 반환한다. Riot 수집·저장·최초 생성·최신화는 Command의 책임이며 분석 결과 스냅샷은 저장하지 않는다.

```text
Next.js route.ts → AnalysisController → CalculatedAnalysisReader
  → StoredAnalysisInputReader → CompletedMatchReader / DrizzleCompletedMatchReader
  → 분석 소유 Record → 19개 도메인 계산 → AnalysisDto
```

- **Presentation**: Controller의 HTTP 입력 검증·응답 변환. Application에 HTTP 타입을 넘기지 않는다.
- **Composition**: [getAnalysisController](../src/backend/analysis/composition/getAnalysisController.ts)가 실제 구현체를 모듈당 한 번 조립한다. DB 초기화는 유효한 첫 조회까지 지연한다. 요청마다 표본을 다시 읽으며 결과를 캐시하지 않는다.
- **Application 계약**: [AnalysisInputReader](../src/backend/analysis/application/AnalysisInputReader.ts)는 분석 입력 집합, [AnalysisReader](../src/backend/analysis/application/AnalysisReader.ts)는 DTO를 반환한다. 분석 도메인은 match·DB·HTTP를 가져오지 않는다.
- **Command Repository**: 기존 PlayerMatchRepository의 도메인 조회·저장은 유지한다. 분석용 Entity·쓰기 Repository는 추가하지 않았다.

## 표본과 DTO

- 대상은 PUUID와 기존 지원 QueueId다. `selectedMatchIds`는 최신 성공·부분 성공 수집의 최대 20개 ID로 실패·분석 제외 ID도 남기고 중복 없는 원래 순서를 유지한다.
- 입력 `matches`와 DTO `analyzedMatchIds`는 그 범위의 분석 가능한 저장 경기만 같은 순서로 담는다. 과거 경기로 누락을 채우지 않으며 각 도메인은 자신의 역할·지표 표본을 추가 선정한다.
- 경기 저장 후 완료 상태와 ID 목록을 같은 조건부 UPDATE로 공개한다. 진행·실패·완료 저장 실패·오래된 완료 요청은 이전 목록을 교체하지 않는다. 먼저 저장한 경기 캐시는 유지한다.
- 완료 목록 없음은 null, 정상 빈 완료는 빈 입력 집합과 0경기 DTO다. 과거 목록 미보유 기록을 추정 복원하지 않으며 다음 정상 수집부터 보존한다.
- [AnalysisMatchInput](../src/backend/analysis/application/types/AnalysisMatchInput.type.ts)은 기존 Record를 묶는 전달 값이다. 두 적 정글 원천·별도 핑·단위를 유지하고 Timeline xp를 experience로 이름만 변환한다. 맵 11·CLASSIC·랭크 큐가 모두 확인되어야 라인전 규칙에 포함한다.
- [AnalysisDto](../src/backend/analysis/application/types/AnalysisDto.type.ts)는 대상·원래/실제 분석 ID와 19개 결과의 데이터 필드만 담는다. 함수·Date·DB 행·오류 객체를 노출하지 않고 중첩 결과를 동결한다.
- 조회 실패는 AnalysisReadError, 도메인 입력·계산 실패는 AnalysisCalculationError로 원인을 보존한다. 정상적인 미제공·판별 불가·분모 0은 결과 상태로 유지한다.

## 조회 HTTP 계약

`GET /api/analysis?puuid=<PUUID>&queueId=420`

[Route Handler](../src/app/api/analysis/route.ts)는 Controller에 위임한다. PUUID는 앞뒤 공백 없는 비어 있지 않은 값, 큐는 지원 QueueId의 정규 숫자 문자열을 각각 정확히 한 번 받는다. 누락·중복·비지원 값·0420·4.2e2는 400이다. 이름·태그 조회나 자동 생성은 수행하지 않는다.

| HTTP | 본문 |
| --- | --- |
| 200 | AnalysisDto. 정상 빈 완료도 포함 |
| 400 | error.code = INVALID_ANALYSIS_QUERY |
| 404 | error.code = ANALYSIS_NOT_FOUND |
| 503 | error.code = ANALYSIS_READ_FAILED |
| 500 | error.code = ANALYSIS_CALCULATION_FAILED 또는 INTERNAL_ERROR |

Controller 응답은 JSON과 Cache-Control: no-store를 사용한다. 실패 본문은 [AnalysisHttpError](../src/backend/analysis/presentation/AnalysisHttpError.type.ts)의 code·message만 노출한다. 기본 Node.js 런타임이며 GET 이외의 메서드는 추가하지 않았다.

구현·검증 상태와 남은 연결 작업은 [진행 상황](project-status.md), 완료 목록 저장은 [경기 수집과 저장](match-data.md), 계산 기준은 [분석 콘텐츠](analysis-content.md)를 따른다.
