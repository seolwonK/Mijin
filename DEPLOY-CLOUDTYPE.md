# CloudType 배포 가이드 (Docker)

Next.js 16 + Prisma(PostgreSQL) 앱을 CloudType에 **Dockerfile 기반**으로 배포합니다.

## 이 리포에 추가된 파일

| 파일 | 역할 |
|---|---|
| `Dockerfile` | 멀티스테이지 빌드(deps→builder→runner). Prisma Client 생성 + `next build`, 런타임은 `next start`. |
| `docker-entrypoint.sh` | 컨테이너 시작 시 `prisma migrate deploy` 실행 후 서버 기동. `RUN_DB_SEED=1`이면 시드도 실행. |
| `.dockerignore` | 이미지에서 로컬 상태·비밀·업로드 제외. |
| `docker-compose.yml` | **로컬 검증용**(app + postgres). 배포엔 사용 안 함. |
| `.env.production.example` | CloudType에 넣을 환경변수 목록. |

> 이 구성은 로컬에서 실제 이미지를 빌드·기동해 마이그레이션 적용, 시드, 로그인(admin/admin1234)까지 동작을 확인했습니다.

---

## 1. 사전 준비: PostgreSQL

앱은 PostgreSQL이 필요합니다(스키마가 postgres 기준). 둘 중 하나:

- **CloudType Postgres 템플릿 추가** → 같은 프로젝트 내부 호스트명으로 연결 (권장).
- **외부 매니지드 DB**(Neon/Supabase 등) → 연결 문자열에 `sslmode=require` 포함.

마이그레이션은 배포 때 컨테이너가 자동으로 적용하므로(`migrate deploy`) 수동 작업이 없습니다.

## 2. ⚠️ 업로드 영속 스토리지 (반드시 설정)

업체 **사업자등록증**이 컨테이너의 `/app/uploads/biz-certs/`에 저장됩니다. 컨테이너 파일시스템은 **재배포·재시작 시 초기화**되므로, 스토리지를 붙이지 않으면 업로드된 증빙이 사라집니다.

- CloudType 서비스 설정 → **스토리지(볼륨)** 추가 → 마운트 경로 **`/app/uploads`**.
- 개인정보(사업자등록증)가 포함되므로 이 볼륨은 백업/접근 통제 대상입니다.

## 3. 환경변수

CloudType 서비스의 **환경변수**에 입력 (`.env.production.example` 참고):

| 변수 | 필수 | 설명 |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL 연결 문자열 |
| `AUTH_SECRET` | ✅ | JWT 서명 키(32자+). `openssl rand -hex 32` |
| `RUN_DB_SEED` | 최초만 | `1`이면 첫 기동 때 관리자/샘플 계정 생성(upsert). 이후 `0` 또는 삭제 |
| `CRON_SECRET` | 선택 | 외부 cron 백업용. 없어도 인프로세스 워커가 자동배정 수행 |
| `KAKAO_REST_API_KEY` | 선택 | 지오코딩. 없으면 주소/좌표 수동 입력 폴백 |
| `SMS_PROVIDER` | 선택 | `console`(로그) 또는 `solapi`(실발송) |
| `SOLAPI_API_KEY` / `SOLAPI_API_SECRET` / `SOLAPI_SENDER` | solapi일 때 | Solapi 계정 |

## 4. 배포 절차

1. 이 리포를 GitHub에 푸시.
2. CloudType → **새 서비스 → GitHub 저장소 연결** → 이 리포 선택.
3. 빌드 방식: **Dockerfile** 자동 인식(루트의 `Dockerfile` 사용).
4. **포트: `3000`** (컨테이너가 `PORT`/`HOSTNAME=0.0.0.0`으로 리슨).
5. 위 **환경변수** 입력, **스토리지 `/app/uploads`** 마운트.
6. 배포 실행. 시작 로그에 `Prisma 마이그레이션 적용` → `앱 시작`이 보이면 정상.
7. CloudType가 HTTPS 도메인을 자동 발급 → 위치·음성 기능이 동작합니다(HTTPS 필수 기능).

### 최초 관리자 로그인

- `RUN_DB_SEED=1`로 첫 배포하면 `admin / admin1234` 및 `partner1~3 / partner1234` 생성됩니다.
- **첫 로그인 후 반드시 비밀번호를 바꾸고**, `RUN_DB_SEED`는 `0`으로 되돌리세요.
- 시드를 원치 않으면, 로컬에서 프로덕션 DB를 대상으로 1회 실행해도 됩니다:
  `DATABASE_URL="<프로덕션 URL>" npx prisma db seed`

## 5. 자동배정 워커 참고

자동배정은 앱 프로세스 내부의 30초 주기 워커(`src/instrumentation.ts`)로 동작합니다. 상시 구동 컨테이너라 그대로 작동합니다.

- **인스턴스를 2개 이상으로 스케일아웃하면** 워커가 중복 실행됩니다. 그럴 땐 인프로세스 워커 대신 외부 cron 한 곳에서만 `/api/internal/auto-assign`을 호출(`x-cron-secret: $CRON_SECRET`)하도록 통일하세요.
- 단일 인스턴스 운영이면 추가 설정 불필요.

## 6. 로컬 검증 (배포 전 권장)

Docker Desktop이 있으면 실제 프로덕션 이미지를 로컬에서 확인:

```bash
docker compose up --build
# → http://localhost:3000, admin / admin1234
```

`Ctrl+C` 후 정리: `docker compose down -v` (`-v`는 DB·업로드 볼륨까지 삭제).

## 7. 트러블슈팅

- **`prisma migrate deploy` 실패** → `DATABASE_URL` 오타/네트워크/`sslmode` 확인. 외부 DB는 `?sslmode=require`.
- **`Can't reach database server`** → CloudType Postgres 내부 호스트명·포트 확인.
- **업로드가 사라짐** → `/app/uploads` 스토리지 미마운트. 2번 항목 참조.
- **이미지 빌드 시 Prisma 엔진 오류** → 베이스 이미지를 바꾸지 마세요(현재 `node:20-bookworm-slim` + `openssl`이 Prisma와 호환).
