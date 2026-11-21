# 비동기 경기 수집 작업 설계

기준일: 2026-11-21. **1~2단계 도메인·Application과 독립 spec은 구현했고 3~6단계는 미구현**이다. Application은 아래 계약과 대역으로 검증했으며 실제 수집 연결·DB 실행 권한·HTTP·배포 설정은 아직 구현하지 않았다.

## 목적과 흐름

Command는 작업을 안전하게 저장한 뒤 접수를 응답한다. 프론트는 작업 상태 Query로 수집 결과를 확인한 다음 기존 분석 Query를 호출한다. 최초 생성과 최신화는 같은 수집 Command를 사용한다.

```text
프론트 → 접수 Command → DB에 작업 저장 → 202 + 작업 ID
독립 워커 → DB의 작업 선점 → Riot 수집·경기 저장 → 완료 확정
프론트 → 작업 상태 Query → 성공·부분 성공이면 분석 Query
```

- 실행 대기열은 PostgreSQL 작업 테이블이다. 별도 메시지 큐나 특정 벤더 SDK를 전제하지 않는다.
- 워커는 같은 저장소의 Application을 호출하는 독립 Node.js 진입점이다. 로컬·서버·컨테이너에서 같은 프로그램을 실행할 수 있도록 구성한다. 웹은 Vercel, DB는 Neon을 예정하지만 워커의 배포 장소는 미정이다.
- 프론트의 상태 Query와 분석 Query는 읽기 전용이다. 조회가 작업 실행·복구·자동 생성을 시작하지 않는다.
- 접수 보장은 DB에 실행 대상이 남는다는 뜻이다. 실제 실행과 복구에는 가동 중인 워커가 필요하며 완료 시간을 보장하지 않는다.

## 모델과 책임

경기 수집에 한정하므로 기존 `match` 모듈에 둔다. 범용 작업 프레임워크는 만들지 않는다.

| 구성 | 책임 |
| --- | --- |
| `MatchCollectionJob` | 작업 한 건의 상태·선택 목록·수집 시도 한도·확정할 종료 결과와 상태 전이 검증 |
| `MatchSync` | 플레이어·큐의 논리적 수집 상태, 최신 완료 표본·성공 시각·20분 제한·429 제한 |
| Application | 접수·실행·재시도·종료 조율과 트랜잭션 계약 호출 |
| Infrastructure | 원자적 접수·선점·실행 권한 갱신·저장·DB 시간 판정, Riot 요청 |
| Composition / 워커 진입점 | 구현체 생성·주입 / 작업 반복 실행·대기·종료 신호 처리 |

### 작업 데이터

| 필드 | 의미 |
| --- | --- |
| `jobId`, `puuid`, `queueId` | 작업 ID와 대상. 큐는 기존 `QueueId` 사용 |
| `status` | 내부 상태: `QUEUED`, `RUNNING`, `RETRY_WAIT`, `FINALIZING`, `SUCCEEDED`, `PARTIALLY_SUCCEEDED`, `FAILED` |
| `requestedAt`, `startedAt`, `finishedAt` | 접수·최초 실행·최종 종료 시각. 시작·종료 전에는 null |
| `selectedMatchIds` | 아직 목록을 확정하지 않았으면 null, 정상 빈 목록이면 `[]`. 최대 20개·중복 없음·원래 순서 유지 |
| `attemptCount`, `maxAttempts` | 최초 수집 선점을 포함한 실행 시도 수와 작업 생성 시 주입·고정하는 한도. 복구에서 초기화하지 않으며 설정 변경은 새 작업부터 반영 |
| `nextAttemptAt` | 자동 복구를 다시 시도할 수 있는 가장 빠른 시각 |
| `lastFailure` | 내부 실패 분류와 원인. 원본 오류는 HTTP에 노출하지 않음 |
| `outcome` | `FINALIZING`에서 기록하고 종료 후에도 유지하는 성공·부분 성공·실패 결과. 429이면 실패 코드·관측한 재시도 가능 시각도 보존. 결과 기록 전에는 null |

`MatchCollectionJob`은 위 상태·시각·결과의 불변식을 담당한다. 토큰과 권한 만료는 별도의 `ExecutionLease` 계약으로 구분한다. 물리적으로 같은 DB 행에 저장해도 Domain 객체가 DB 토큰 비교를 구현하지 않는다. 초기 버전은 시도별 이력 테이블 없이 횟수·최근 원인·구조화된 로그로 추적한다.

`ExecutionLease`는 `jobId`, `executionToken`, `purpose`(`COLLECT` / `FINALIZE`), `leaseExpiresAt`을 가진다. Infrastructure가 DB 시각·토큰으로 원자적 소유권을 보장하고, Application은 반환된 권한을 쓰기 요청과 갱신에 전달한다. 매 선점마다 토큰을 교체한다. Domain은 전달받은 시각·실행 결과로 상태 전이를 검증하며 DB나 운영 플랫폼에 의존하지 않는다.

### 상태와 불변식

```text
QUEUED → RUNNING
RUNNING → RETRY_WAIT → RUNNING (복구 수집)
RUNNING / RETRY_WAIT → FINALIZING (수집 결과 또는 시도 한도 소진)
FINALIZING → SUCCEEDED / PARTIALLY_SUCCEEDED / FAILED
```

- 대상 `(puuid, queueId)`마다 미종료 작업은 최대 하나다. `QUEUED`·`RUNNING`·`RETRY_WAIT`·`FINALIZING` 모두 활성 작업 유일성 제약과 중복 요청 공유 대상이다.
- 복구를 예약하면 `RETRY_WAIT`로 전이하고 권한을 해제하며 `nextAttemptAt`을 기록한다. 실행 권한이 만료된 `RUNNING`도 DB에서 상태를 확인한 뒤 복구 예약 또는 한도 소진 처리를 한다.
- 최초 수집 선점에서만 `startedAt`을 설정한다. 복구 수집 선점은 새 토큰을 부여하고 `attemptCount`만 증가시킨다.
- 수집 종료 결과를 저장하면 `FINALIZING`으로 전이하고 `outcome`을 변경 불가능하게 보존한다. 같은 트랜잭션에서 `COLLECT` 권한을 새 토큰의 `FINALIZE` 권한으로 교체한다. 이 상태에서는 Riot 수집을 다시 실행하지 않으며, 수집 시도 한도 소진도 이 경로로 실패를 확정한다.
- `FINALIZING`의 권한 만료는 종료 처리만 다시 선점한다. `FINALIZE` 권한으로 목록·경기를 수집하거나 `attemptCount`를 증가시키지 않는다. 이 시점에는 수집 결과가 정해졌으며 DB 결과 확정만 남아 있다.
- 종료 상태는 변경하지 않는다. 작업·MatchSync 최종 확정 트랜잭션에서 실행 권한을 제거하고 `finishedAt`을 기록한다. `outcome`은 종료 결과·실패 사유 조회를 위해 유지한다.
- 저장한 선택 목록은 같은 작업에서 교체하지 않는다. 복구 시 저장 경기는 재사용하고 없는 경기만 요청한다. 목록 확정 전에 중단됐다면 다음 실행이 목록을 조회한다.
- 복구 한도 소진은 해당 작업의 종료다. 사용자의 새 Command는 제한을 통과하면 새 ID·새 시도 횟수·새 최신 목록으로 실행한다.

### 내부 상태와 화면 표시

| 내부 상태 | 상태 Query의 공개 상태 | 화면 표시 |
| --- | --- | --- |
| `QUEUED` | `QUEUED` | 대기 중 |
| `RUNNING`, `RETRY_WAIT`, `FINALIZING` | `RUNNING` | 수집 중 |
| `SUCCEEDED` | `SUCCEEDED` | 분석 Query 호출 |
| `PARTIALLY_SUCCEEDED` | `PARTIALLY_SUCCEEDED` | 분석 Query 호출·일부 수집 실패 안내 |
| `FAILED` | `FAILED` | 실패 사유·재요청 안내 |

화면을 단순하게 유지하려고 내부 상태를 합치지 않는다. Reader가 명시적으로 공개 상태로 투영한다. 분석 Query 대기는 프론트의 분석 중 상태이며 수집 작업 상태에 포함하지 않는다.

## 접수와 MatchSync 연결

접수 전체를 대상별로 직렬화한 짧은 DB 트랜잭션으로 처리한다. 최초 대상 행 생성도 이 경계에 포함한다. 선점·종료 등 대상과 작업을 함께 잠그는 처리도 동일한 잠금 순서를 따른다.

1. 활성 작업이 있으면 새 작업 없이 기존 ID를 반환한다. 대기·복구 대기·종료 확정 중도 포함한다.
2. 활성 작업이 없으면 기존 성공 후 20분 제한과 API 재시도 제한을 검사한다. 둘 다 지난 시점부터 허용하며, 거부 시 유효한 제한 시각 중 가장 늦은 시각을 반환한다.
3. `QUEUED` 작업 생성, `MatchSync.start`에 해당하는 논리적 수집 시작, `activeJobId` 연결을 함께 저장한다. **커밋 확인 뒤에만** 202를 반환한다.

`activeJobId`는 새로 필요한 저장 계약이다. 접수부터 종료까지 `MatchSync.IN_PROGRESS`를 유지하고 `lastAttemptAt`은 이 논리적 수집의 시작 시각으로 사용한다. 실제 워커 시작은 작업의 `startedAt`으로 구분한다. 이는 현재의 서비스 호출 시점 시작을 접수 시점 시작으로 바꾸는 설계다.

워커 복구에서는 `MatchSync.start`나 기존 `tryStart`를 다시 호출하지 않는다. 같은 `activeJobId`를 유지한다. `FINALIZING`도 논리적 수집 진행 상태를 유지하며 종료 트랜잭션에서 작업 결과와 `MatchSync`를 갱신하고 연결을 해제한다. 모든 실행 경로는 이 계약을 사용해야 하며 기존 수집 진입점이 별도로 시작·완료하게 두지 않는다.

기존 `IN_PROGRESS`인데 연결 작업이 없는 데이터는 임의로 복구하지 않는다. 도입 전 실행 중 수집이 없는지 확인하고 잔여 기록을 검토·정리하는 전환 절차가 필요하다.

## Application 인터페이스 제안

실제 선언은 기존처럼 파일당 하나씩 작성한다. 각 메서드는 `Result`로 예상 실패를 반환하며, 유스케이스에 HTTP·Drizzle 타입을 전달하지 않는다.

| 계약·메서드 | 입력 → 결과 |
| --- | --- |
| `RequestMatchCollection.execute` | `{ puuid, queueId }` → `{ jobId, created }` 또는 제한·저장 오류 |
| `MatchCollectionJobReader.findById` | `jobId` → 상태 DTO 또는 null·조회 오류 |
| `RunMatchCollection.execute` | 작업·`COLLECT` 권한·`AbortSignal` → 수집 결과 저장 또는 복구 예약 |
| `FinalizeMatchCollection.execute` | 작업·`FINALIZE` 권한 → 저장된 종료 결과를 원자적으로 확정 |
| `MatchCollectionAdmission.admit` | 대상 → 위 접수 트랜잭션의 결과 |
| `MatchCollectionExecution.claimNext` | 작업과 `COLLECT` 또는 `FINALIZE` 권한, 없으면 null. 실행 정책은 구현체에 주입 |
| `MatchCollectionExecution.renew` | 현재 권한 → 갱신된 권한 또는 권한 상실. 유효기간은 구현체에 주입 |
| `MatchCollectionExecution.scheduleRetry` | `COLLECT` 권한·실패 분류 → `RETRY_WAIT` 예약(null) 또는 한도 소진의 `FINALIZING` 작업·권한. 지연은 구현체에 주입 |
| `MatchCollectionProgress.saveSelection` | `COLLECT` 권한·ID 목록 → 최초 목록 확정 또는 권한 상실 |
| `MatchCollectionProgress.saveMatches` | `COLLECT` 권한·확보 경기 → 실행 권한 검증과 경기 저장 |
| `MatchCollectionCompletion.recordOutcome` | `COLLECT` 권한·종료 결과 → `FINALIZING`과 결과 저장·`FINALIZE` 권한 반환 |
| `MatchCollectionCompletion.finish` | `FINALIZE` 권한 → 저장된 결과로 작업·MatchSync·완료 표본 원자적 확정 |

영속성 포트는 접수(`Admission`), 실행 권한·재시도(`Execution`), 수집 진행 저장(`Progress`), 결과 기록·확정(`Completion`)으로 책임을 나눈다. 이는 인터페이스의 책임 구분이며 구현 클래스·테이블·프로세스를 각각 만들라는 뜻은 아니다. 완료와 같은 원자적 작업은 하나의 인프라 트랜잭션으로 구현하며 여러 Repository 순차 호출로 대신하지 않는다.

Domain은 상태 전이·시도 한도·선택 목록·종료 결과 불변식을 검증한다. Application은 오류 분류와 호출 순서를 조율한다. Infrastructure는 DB에서 현재 상태를 읽고 Domain 규칙을 적용한 뒤 토큰·만료·행 제약을 확인해 저장한다. 반환 결과는 접수 거부·권한 상실·저장 실패를 구분한다.

## 워커 실행과 복구

- `claimNext`는 DB 시각을 기준으로 대기 작업·기한이 지난 복구 예약·만료된 실행 권한을 처리한다. 일반 수집은 `COLLECT`, 저장된 결과의 확정은 `FINALIZE` 권한을 반환한다. 한 작업을 여러 워커가 동시에 소유하지 못하게 하며 Riot 요청 동안 DB 잠금을 유지하지 않는다.
- 수집 자동 복구 대상은 워커 중단과 분류 가능한 일시적 인프라 장애다. 같은 `attemptCount` 한도를 사용한다. 한도에 도달한 만료 작업도 다음 처리에서 실패 결과를 기록하고 종료 확정으로 넘겨 영구 점유를 막는다.
- `renew`와 모든 작업 쓰기는 권한 목적·토큰·만료·대상 연결·내부 상태를 검증한다. 만료되거나 교체된 권한의 목록·경기 저장·완료를 거부한다. 갱신 거절 또는 권한 확인 실패 시 워커는 중단 신호를 전달하고 새 Riot 요청을 시작하지 않는다. 이미 전송된 외부 요청의 취소까지 보장하지는 않는다.
- 일시적 실패 시 권한이 유효하면 복구를 예약한다. DB 자체가 불통이면 권한 갱신을 멈추고, DB 복구 후 다른 워커가 만료를 감지하게 한다.
- 완료 트랜잭션의 응답만 유실됐다면 DB의 작업 상태와 토큰부터 확인한다. 이미 종료됐다면 다시 수집하지 않는다. 상태를 확인할 수 없을 때 성공·실패를 추정해 덮어쓰지 않는다.
- `FINALIZING`의 저장 장애·권한 만료는 종료 처리만 반복한다. 수집 시도 한도는 추가 Riot 수집을 막는 한도이며, 이미 저장한 결과를 DB에 확정하는 데 소진된 수집 횟수를 적용하지 않는다. DB가 복구되지 않으면 최종 종료도 보장할 수 없다.
- Riot 호출은 중복될 수 있으므로 정확히 한 번 실행을 보장하지 않는다. 저장 경기 재사용과 토큰 검증으로 중복 실행의 영향을 제한하고 완료 표본 공개는 현재 실행만 허용한다.

### 오류 분류

| 원인 | 처리 |
| --- | --- |
| 워커 중단·분류 가능한 일시적 DB/인프라 장애 | 같은 작업에서 대기 후 제한된 자동 복구 |
| Riot 429 | 실패 결과·재시도 가능 시각을 우선 기록하고 종료만 재시도. Riot 재호출 금지. 아래 보장 경계 참고 |
| 인증·설정·응답 검증 오류, 재시도 불가/미분류 오류 | 자동 재시도 없이 실패 |
| 개별 경기 404·5xx·타임아웃·통신 오류 | 기존처럼 다른 경기를 진행. 확보 기록이 있으면 부분 성공, 모두 실패하고 캐시도 없으면 실패 |
| 최초 ID 목록 요청의 일시적 통신·5xx 오류 | 분류 가능한 일시적 외부 장애로 같은 시도 한도 안에서 재시도. 429·인증·응답 오류는 위 규칙 우선 |

마지막 행은 기존의 목록 조회 실패 즉시 종료를 확장하는 **상세 제안**이다. 개별 경기 오류를 모두 작업 재시도로 바꾸지는 않는다. 기존 API 원인과 저장 오류가 함께 있으면 둘 다 보존한다.

### 429 기록과 종료 실패의 보장 경계

1. 429를 받으면 새 Riot 요청을 중단하고 진행 중 요청에 취소 신호를 전달한다.
2. 현재 `COLLECT` 권한으로 `recordOutcome`을 호출해 `FINALIZING`·실패 결과·관측한 재시도 가능 시각을 먼저 커밋한다. 기존 성공·부분 성공 결과를 공개하지 않으며 확보된 캐시는 유지한다. 아직 저장하지 못한 성공 경기의 캐시 저장보다 429 기록을 우선한다.
3. `finish`가 실패하거나 워커가 종료돼도 다음 워커는 저장된 실패 결과의 확정만 수행한다. `MatchSync` 실패·API 제한 반영과 작업의 `FAILED` 전이는 같은 종료 트랜잭션이다. 확정 전 새 Command는 기존 활성 작업을 공유한다.
4. 429 기록의 커밋 응답만 유실됐다면 DB를 재조회한다. 이미 `FINALIZING` 또는 `FAILED`이면 Riot 수집으로 돌아가지 않는다. 살아 있는 워커가 미저장을 확인한 경우에도 알려진 429의 기록·종료만 재시도한다.

**보장 한계:** DB 장애 등으로 429 사실 자체를 저장하지 못한 채 프로세스가 종료됐다면, 다음 워커는 이를 알 수 없다. 저장 상태가 `RUNNING`으로 남아 일반 복구가 일어나 Riot 요청이 다시 전송될 수 있다. 로그만으로 실행 정책을 보장하지 않는다. 따라서 “기록된 429에는 자동 수집 재시도를 하지 않는다”를 보장하며 “관측됐지만 유실된 모든 429까지 재호출을 막는다”고 주장하지 않는다. 권한을 잃은 워커도 새 토큰 소유자의 작업 상태를 덮어쓰지 않는다.

### 운영 설정

`leaseDurationMs`, `heartbeatIntervalMs`, `maxAttempts`(수집 실행 한도), `retryDelayMs`, `idlePollIntervalMs`를 실행 설정으로 주입한다. 값은 미정이며 양수·유한값, 시도 수는 양의 정수, 갱신 간격은 유효기간보다 짧도록 검증한다. 종료 처리의 저장 재시도에도 대기 간격을 적용해 장애 중 반복 요청을 제한한다. 실제 DB 지연·경쟁·프로세스 종료 실험으로 조정한다. 기존 성공 후 20분 제한은 별도의 비즈니스 규칙으로 유지한다.

초기에는 워커의 작업 동시 실행 수를 1로 둔다는 **운영 제안**이다. 경기 두 개 병렬 조회는 한 작업 내부 정책이며, 여러 워커의 Riot 전역 호출 제한을 보장하지 않는다. 전역 호출량 제어와 확장 정책은 별도 설계다.

## 완료와 분석 조회

- 확보 경기는 먼저 저장한다. 목록을 정상 확보했지만 비어 있으면 성공이며, 분석 제외 경기만 있어도 정상적인 0경기 분석이 가능하다.
- 성공·부분 성공 시 작업 종료, `MatchSync`의 상태·성공 시각·최초 선택 목록 공개, 활성 연결 해제를 **같은 트랜잭션**에서 처리한다. 모든 조건이 충족되지 않으면 롤백한다.
- 실패·복구 한도 소진 시에도 작업 종료와 `MatchSync` 실패·활성 연결 해제를 함께 처리한다. 이전 완료 목록·성공 시각과 저장된 경기 캐시는 유지한다.
- 종료 결과는 `recordOutcome`으로 먼저 내구성 있게 저장한다. 그 후 `finish`가 실패하면 성공으로 공개하지 않고 `FINALIZING`을 재확인·재선점해 종료 처리만 수행한다. 429 사실의 기록 자체가 실패한 경우는 위 보장 한계를 따른다.
- 상태 Query의 성공은 해당 완료 표본이 커밋됐다는 의미다. 분석 GET은 기존처럼 최신 완료 표본을 계산한다. 더 나중의 작업이 이미 완료됐다면 더 최신 결과가 나올 수 있으며 작업별 분석 스냅샷은 제공하지 않는다.
- 분석 실패는 수집 작업 상태를 되돌리지 않는다. 프론트가 분석 Query만 재시도한다.

## HTTP 계약 제안

`POST /api/match-collection-jobs`의 JSON 입력은 `{ "puuid": "…", "queueId": 420 }`다. 기존 지원 큐와 PUUID 검증을 사용한다. Riot ID 검색은 별도 유스케이스다.

| HTTP | 결과 |
| --- | --- |
| 202 | `{ jobId, created }`. 새 접수는 true, 기존 활성 작업 공유는 false. `Location`은 상태 조회 URL |
| 400 | `INVALID_COLLECTION_COMMAND` |
| 409 | `COLLECTION_COOLDOWN` 또는 `RIOT_RETRY_RESTRICTED`와 `retryAvailableAt`. 작업은 만들지 않음 |
| 503 | `COLLECTION_ADMISSION_FAILED`. 커밋 응답 유실 시 접수 여부가 불명확할 수 있으며 재요청은 활성 작업을 공유 |

`GET /api/match-collection-jobs/{jobId}`는 다음 필드의 JSON DTO를 반환한다.

- `jobId`, `target: { puuid, queueId }`, 위 표에 따라 투영한 공개 `status`. `RETRY_WAIT`·`FINALIZING`을 직접 노출하지 않는다.
- `requestedAt`, `startedAt`, `finishedAt`: ISO 시각 문자열 또는 해당 없음의 null.
- `failure`: 실패 시 공개 코드·안내 문구, 그 외 null. 내부 원인·토큰·시도 횟수는 제외한다.
- `retryAvailableAt`: 조회 시점의 해당 대상에 적용되는 성공 대기·API 제한 중 가장 늦은 미래 시각, 없으면 null. 실제 새 접수 가능 여부는 Command에서 다시 판단한다.

작업을 읽었으면 실패 작업도 HTTP 200이다. 없는 작업은 404, 잘못된 ID는 400, 저장소 조회 실패는 503이다. 예상하지 못한 내부 오류는 두 API 모두 500이며 내부 상세를 숨긴다. 모든 응답은 `Cache-Control: no-store`다. 폴링 간격은 프론트 설정이며 상태 Query는 순수 조회로 유지한다.

## 구현 순서와 spec

1~2단계는 완료했으며 3~6단계는 미착수다. 다음은 기존 수집 서비스 연결이며 DB의 동시성·원자성 보장을 확인한 뒤 API·워커를 연결한다.

| 단계 | 작업 범위 | 완료 기준 |
| --- | --- | --- |
| 1. 작업 도메인·spec | `MatchCollectionJob`, 상태·선택 목록·수집 시도 한도·종료 결과 | 생성·상태 전이, 고정 목록, 한도 소진, 종료 결과 불변성의 독립 spec 통과 |
| 2. Application 계약·유스케이스 | 접수·수집 실행·결과 확정·상태 조회와 영속성 인터페이스 | 외부 경계 대역으로 중복 접수·제한·복구·429 처리와 공개 상태 투영 검증. 원자성은 포트의 요구 계약으로 명시 |
| 3. 기존 수집 서비스 연결 | 목록 확보·확정 목록 수집·완료 조율 분리, 기존 수집 로직 재사용 | 저장 경기 재사용·부분 성공·기존 분석 표본 유지와 고정 목록 재개 검증. 시작·완료를 중복 처리하지 않음 |
| 4. DB 구현·통합 검증 | 작업 저장·활성 유일성·선점·갱신·토큰 검증·결과 기록·원자적 완료, 마이그레이션 생성·검토 | 로컬 임시 스키마에서 동시 접수·워커 경쟁·늦은 쓰기·중단 복구·롤백·응답 유실 재확인 검증. 기존 `lastAttemptAt`만으로 실행 권한을 대신하지 않음 |
| 5. HTTP·워커 진입점 | 얇은 접수 API·상태 Query, 벤더 독립 워커와 Composition | 로컬에서 접수 → 수집 → 상태 확인 → 기존 분석 조회의 대표 흐름과 워커 종료 신호 처리 검증 |
| 6. 운영 검증·화면 연결 | 실행 설정 조정, 워커 배포 장소·종료 유예·작업 보관 기간 결정, 프론트 폴링·실패 안내 | 실제 환경의 지연·중단·재시도·폴링 부하와 분석 실패 시 Query만 재시도하는 흐름 확인 |

각 단계의 spec은 기본 사용법 → 주요 규칙 → 경계·오류 순서로 작성한다. 새 동작은 계약에 따른 실패를 확인한 뒤 최소 구현하며 기존 검증을 유지한다. 단계별 관련 테스트와 루트 지침의 fmt·lint·전체 테스트를 실행하고, 타입·공유 계약 변경 시 타입 검사도 실행한다. 실행하지 못한 DB·운영 검증은 별도로 보고한다. 배포·대상 DB 마이그레이션 적용은 로컬 구현·검증과 구분해 별도 작업으로 진행한다.

### 첫 작업: 1단계에 한정

완료: [MatchCollectionJob](../src/backend/match/domain/MatchCollectionJob.ts), [기록 타입](../src/backend/match/domain/types/MatchCollectionJobData.type.ts), 상태·실패·결과 타입과 오류 계약, [독립 spec](../src/backend/match/domain/MatchCollectionJob.spec.ts). 미구현 상태의 실패를 확인한 뒤 구현했으며 72개 사례가 기본·무작위 순서로 통과했다.

현재 도메인 API는 `create`, `snapshot`, `start`, `selectMatches`, `scheduleRetry`, `recordOutcome`, `finish`다. 작업 생성·변경은 `Result`로 입력 오류와 전이 거절을 구분하며 실패한 변경은 상태를 보존한다. `snapshot`은 Date를 복사하고 목록·결과 객체를 동결한 관찰용 기록이다. DB 복원·원자적 선점·공개 DTO 투영은 아직 구현하지 않았다.

수집 복구는 `WORKER_INTERRUPTED`·`TEMPORARY_FAILURE`에만 허용한다. 한도 소진 결과는 `ATTEMPTS_EXHAUSTED`로 기록하되 마지막 실제 장애 사유도 따로 보존한다. 성공에는 확정 목록이 필요하며 빈 목록은 정상 성공, 빈 목록의 부분 성공은 입력 오류다. 시각은 마지막 전이보다 역행할 수 없고, 복구 예정 시각과 같은 순간부터 다시 시작할 수 있다.

- 작업 상태·선택 목록·수집 시도 한도·종료 결과의 타입과 필요한 오류 계약.
- `MatchCollectionJob`의 생성·수집 시작·복구 대기·결과 기록·최종 종료 전이.
- 최초 선택 목록의 고정, null과 빈 목록 구분, 복구 시 시도 횟수 유지·한도 소진 처리.
- `FINALIZING`에서 결과 변경·수집 재개 금지와 종료 상태의 불변성.
- 작은 입력과 명시적 기대값을 사용하는 독립 spec.

1단계에서는 실제 DB 선점·토큰 소유권·만료 경쟁, HTTP·워커 진입점, 기존 수집 서비스 변경을 구현하지 않는다. 도메인은 전달된 시각·결과로 규칙을 검증하고 실제 실행 권한의 원자성은 4단계 DB 통합 테스트에서 확인한다. 유효기간·갱신 간격 등 운영 숫자는 고정하지 않는다.

### 2단계: Application 계약·유스케이스 — 완료

- [RequestMatchCollection](../src/backend/match/application/RequestMatchCollection.ts): 대상·시도 한도를 검증하고 원자적 접수 포트에 위임한다. 직접 수집하거나 DB 시각·작업 ID를 생성하지 않는다.
- [ProjectedMatchCollectionJobReader](../src/backend/match/application/ProjectedMatchCollectionJobReader.ts): 읽기 전용 포트에서 작업과 현재 대상의 접수 제한을 받아 내부 상태를 공개 DTO로 투영한다. 실패 코드의 고정 안내와 ISO 시각만 반환한다.
- [RunMatchCollection](../src/backend/match/application/RunMatchCollection.ts): 권한 재확인 → 최초 목록 저장 또는 고정 목록 재사용 → 수집 → 경기 저장 → 결과 기록을 조율한다. 반환 작업은 `FINALIZING`·`FINALIZE` 권한이며 null은 복구 예약 성공이다.
- [FinalizeMatchCollection](../src/backend/match/application/FinalizeMatchCollection.ts): 수집 경계에 의존하지 않고 기록된 결과의 완료만 요청한다. 완료 포트가 현재 권한 또는 이미 커밋한 종료 결과를 확인하므로 응답 유실 뒤에도 불필요한 선행 권한 갱신으로 종료 확인을 막지 않는다.

접수·실행 권한·진행 저장·결과 확정의 영속성 포트, 읽기 전용 Query/Reader, `ExecutionLease`·선점 작업·공개 DTO 계약을 추가했다. 실제 DB 시간 판정·직렬화·원자성은 각 포트의 요구 계약이며 구현·증명은 4단계다.

[MatchCollectionSource](../src/backend/match/application/MatchCollectionSource.ts)는 다음 단계에서 기존 수집 로직을 연결할 포트다. `findSelection`과 `collectSelection`으로 목록 조회와 고정 목록 수집을 나눴다. 수집 구현은 저장 경기를 읽고 누락만 요청한 뒤 신규 경기와 결론을 반환한다. 작업·경기 저장 및 완료 표본 공개는 Application의 권한 검증 포트를 통해 수행한다. 긴 수집 중 주기적 권한 갱신과 중단 신호 전달은 5단계 워커에서 연결하며 현재 유스케이스는 외부 수집 전후의 경계에서 권한을 재확인한다.

429는 미저장 경기 캐시보다 결과 기록을 우선한다. 다른 영구 수집 실패도 캐시 저장 장애 때문에 일반 수집 복구로 바꾸지 않는다. 결과 기록의 저장 실패는 `MatchCollectionOutcomeSaveError`에 관측한 결과·권한·원인을 남긴다. 호출자는 DB 상태 확인 후 `recordOutcome`만 재시도해야 하며 `RunMatchCollection.execute`를 재실행해서는 안 된다. 이 호출자 복구 루프는 5단계에서 연결한다.

새 spec 71개는 실제 작업·MatchSync를 사용하는 [메모리 대역](../src/backend/match/testing/MemoryMatchCollectionJobs.ts)으로 기본·무작위 순서에서 통과했다. 접수부터 완료까지의 대표 Application 흐름, 활성 작업 공유·20분 경계, 429·권한 상실·저장 장애·커밋 응답 유실을 검증했다. 대역은 DB 경쟁·트랜잭션 원자성·실제 워커 중단 복구를 검증한 증거가 아니다. 기존 수집 서비스·Riot 어댑터·분석 Query는 변경하지 않았다.

필수 검증 사례는 동시 접수 1건, 대기·복구·종료 확정 중 ID 공유, 내부 상태의 화면 상태 투영, 20분/429 경계, 목록 확정 전후 중단, 저장분 재사용, 토큰 교체 후 늦은 쓰기, 한도 소진 점유 해제, 완료 응답 유실 재확인, 완료 트랜잭션 롤백, 분석만 실패한 재조회다. 429는 결과 저장 후 종료 실패·기록 응답 유실·사실 자체의 유실을 구분해 검증한다. 초기 spec과 DB 통합 검증으로 계약을 확인하기 전에는 구현 완료로 표시하지 않는다.
