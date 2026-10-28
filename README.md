# loltfolio

## 개발

```bash
pnpm install --frozen-lockfile
pnpm dev
```

페이지는 `src/app/page.tsx`, 공통 레이아웃은 `src/app/layout.tsx`에서 수정합니다.

## 검증 및 빌드

```bash
pnpm fmt
pnpm lint
pnpm build
```

## 로컬 PostgreSQL + Drizzle

Docker Desktop을 실행한 뒤 프로젝트 루트에서 사용합니다. Dockerfile 없이 `compose.yaml`로
`postgres:17` 컨테이너를 실행하며, Mac의 `localhost:15432`에서 접근합니다.

```bash
# 최초 설정: 이미 .env가 있다면 덮어쓰지 말고 DATABASE_URL을 확인
cp -n .env.example .env
pnpm db:start
pnpm db:check
pnpm dev

# 작업 종료: 데이터 볼륨은 유지
pnpm db:stop
# 다음 작업 시 기존 컨테이너 재시작
pnpm db:start
```

- 컨테이너: `loltfolio-postgres`
- named volume: `loltfolio-postgres-data` → `/var/lib/postgresql/data`
- 컨테이너를 삭제해도 named volume을 삭제하지 않으면 데이터는 유지됩니다.
- 컨테이너 재생성: `docker compose down` → `pnpm db:start`.
- `docker compose down -v` 또는 `docker volume rm`으로 볼륨을 삭제하면 데이터가 사라집니다.
- DB 사용자·비밀번호·DB 이름은 빈 볼륨의 최초 초기화 때만 적용됩니다.
  기존 계정 변경은 별도 SQL이 필요합니다. 포트 변경은 `pnpm db:start` 시 재생성으로 반영됩니다.

`.env`에는 로컬 전용 `DATABASE_URL`을 넣습니다. Next.js와 Drizzle CLI가
이 파일을 읽습니다. 외부에서 주입한
`DATABASE_URL`은 파일보다 우선합니다. Compose는 `.env`의 `POSTGRES_USER`,
`POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`를 읽습니다.
`DATABASE_URL`도 동일한 계정·DB·포트로 맞춰야 합니다. Compose는 URL을 파싱하지
않습니다. `db:check`는 최종 연결 대상이 localhost인지 확인합니다.
DB URL은 서버 전용이며 `NEXT_PUBLIC_` 접두사를 사용하지 않습니다.

서버 Repository에서는 `src/backend/db/client.ts`의 `getDatabase()`를 사용합니다.
`pg` 기반이므로 Node.js 런타임에서 로컬 PostgreSQL과 Neon에 같은 코드를 사용할 수
있습니다. Neon에서는 배포 환경의 연결 문자열(TLS 설정 포함)을 주입합니다.
컨테이너 내부에서 앱을 실행한다면 localhost 주소를 그대로 사용할 수 없습니다.

### 테이블 변경

현재 실제 도메인 테이블과 마이그레이션은 없습니다. `src/backend/db/schema.ts`에 저장 구조를
정의하거나 도메인별 테이블을 재노출한 뒤 다음 순서로 진행합니다.
도메인 Entity와 Drizzle 테이블 정의는 분리합니다.

```bash
pnpm db:generate --name=add_feature
# 생성된 src/backend/db/migrations/ 아래 SQL 검토
pnpm db:migrate
pnpm db:check
```

SQL과 스냅샷은 코드와 함께 커밋합니다. 이미 적용한 마이그레이션은 수정하지 않고
후속 마이그레이션으로 변경합니다. 운영에서는 검토된 파일만 `migrate`로 적용하며
`push`는 사용하지 않습니다. 운영 실행은 이후 배포 워크플로우에서 별도로 구성합니다.
`db:migrate`는 선택된 DATABASE_URL의 DB를 변경하므로 실행 전에 대상을 확인하세요.

## 코드 구조

- `src/app`: Next.js 라우팅 진입점만 유지합니다.
- `src/frontend`: 화면 구현과 MVVM 코드, 전용 `AGENTS.md`.
- `src/backend`: 도메인 모듈과 DB 코드, 전용 `AGENTS.md`.

Drizzle 설정은 `src/backend/drizzle.config.ts`에 있습니다. 명령은 프로젝트 루트에서
실행합니다. 설정 파일 위치에서 프로젝트 루트를 계산해 환경변수·테이블·출력 경로를
절대 경로로 지정하므로 CLI의 작업 디렉터리 변경에 영향을 받지 않습니다. 테이블 정의는
`src/backend/db/schema.ts`, 생성되는 SQL과 스냅샷은
`src/backend/db/migrations/`에 보관합니다. 아직 테이블이 없어 마이그레이션 폴더는
생성되지 않았습니다.
