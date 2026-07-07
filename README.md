# ⚡ 전기 출동 서비스 (mijin)

전기 고장이 난 고객이 모바일 웹으로 문의를 접수하면, 관리자가 근처 전기 출동 업체를 배정해주는 매칭 플랫폼.

## 핵심 기능

- **고객 (비회원)**: 텍스트 또는 음성으로 고장 내용 입력 → 긴급도 선택(초긴급 1시간 / 긴급 2시간 / 일반) → "내 위치 확인" 버튼으로 일회성 위치 첨부 → 접수. 전화번호만 입력하면 진행 상황 조회 (접수번호 6자리는 참조용, IP당 분당 10회 레이트리밋).
  - 음성 입력은 **녹음(MediaRecorder) + 실시간 STT(Web Speech API)** 병행: 실시간 STT 미지원 브라우저(삼성인터넷, iOS Chrome 등)에서도 녹음은 동작. 녹음본은 **DB(StoredFile)에 저장**되어 **관리자가 접수 상세에서 청취**할 수 있고, `STT_PROVIDER` 설정 시 **서버 STT(Gemini)** 가 자동으로 텍스트 변환.
- **관리자**: 접수 대시보드에서 거리순 추천 업체를 보고 수동 배정(기본 모드). 업체 등록/관리, 자동배정 설정.
- **자동배정**: 관리자가 설정한 대기시간(긴급도별) 안에 수동 배정이 없으면 가장 가까운 활성 업체에 자동 배정. 30초 주기 인프로세스 워커 + 외부 cron 백업 라우트.
- **업체 포털**: 배정 건 수락/거절, 출동 시작/완료 처리. 거절 시 자동 재배정(자동배정 건) 또는 관리자 반환.
- **업체 가입 심사**: 업체가 직접 가입 신청(사업자등록번호 체크섬 검증 + 사업자등록증 사진/PDF 첨부, `uploads/`에 저장·관리자만 열람) → 관리자 승인 후 로그인·배정 가능. 승인/거절 결과는 문자 안내. 관리자 직접 등록은 즉시 승인.
- **SMS**: **접수 완료 시 고객에게 1건** + **배정 시 담당 업체에게 1건**(고객 연락처·주소·긴급도 포함, 수동/자동/재배정 공통) 발송 (Solapi). 수락·완료·가입 심사 결과는 화면에서 확인. 개발 시엔 `SMS_PROVIDER=console`로 로그 대체 가능, 발송 내역은 `SmsLog`에 기록.

## 기술 스택

Next.js (App Router, TypeScript) · PostgreSQL + Prisma · Tailwind CSS · jose(JWT 세션) · Web Speech API

## 실행 방법

```bash
# 1. PostgreSQL 데이터베이스 생성
createdb mijin

# 2. 환경변수 (.env.example 참고해 .env 작성)
#    DATABASE_URL, AUTH_SECRET 필수

# 3. 설치 & 마이그레이션 & 시드
npm install
npx prisma migrate dev
npx prisma db seed

# 4. 개발 서버
npm run dev
```

http://localhost:3000 을 모바일 뷰포트(Chrome DevTools)로 열기.

### 시드 계정

| 역할 | 아이디 | 비밀번호 |
|---|---|---|
| 관리자 | `admin` | `admin1234` |
| 업체 (강남/마포/노원전기) | `partner1` ~ `partner3` | `partner1234` |

## 환경변수

| 변수 | 설명 |
|---|---|
| `DATABASE_URL` | PostgreSQL 연결 문자열 |
| `AUTH_SECRET` | JWT 서명 키 (`openssl rand -hex 32`) |
| `CRON_SECRET` | `/api/internal/auto-assign` 호출용 (외부 cron 백업) |
| `KAKAO_REST_API_KEY` | 카카오 로컬 API (지오코딩). 없으면 주소/좌표 수동 입력 폴백 |
| `SMS_PROVIDER` | `console`(개발) 또는 `solapi` |
| `SOLAPI_API_KEY` / `SOLAPI_API_SECRET` / `SOLAPI_SENDER` | Solapi 계정 정보 (운영 시) |
| `STT_PROVIDER` | 음성 접수 자동 텍스트 변환: `gemini` 또는 `openai` (미설정 시 변환 생략) |
| `GEMINI_API_KEY` | STT_PROVIDER=gemini 일 때 (발급: aistudio.google.com/apikey) |

## 접수 상태 흐름

```
RECEIVED(배정 대기) → ASSIGNED(배정됨) → ACCEPTED(수락) → DISPATCHED(출동중) → COMPLETED(완료)
  · 업체 거절 → 자동배정 건: 다음 순위 업체 재배정 / 후보 소진·수동 건: RECEIVED + 관리자 확인 필요 표시
  · 관리자 취소 → CANCELED
```

- 배정 이력은 `Assignment` 테이블에 모두 보존됩니다.
- 중복 배정은 `updateMany + status 조건`(CAS)으로 DB 수준에서 차단됩니다.

## 주요 경로

| 경로 | 화면 |
|---|---|
| `/` | 고객 랜딩 |
| `/request/new` | 고장 접수 (STT·위치·긴급도) |
| `/lookup` | 접수 조회 (전화번호) |
| `/partner` | 업체 포털 |
| `/admin` | 관리자 대시보드 |
| `/admin/providers` | 업체 관리 |
| `/admin/settings` | 자동배정 설정 |

## 휴대폰으로 테스트 (같은 Wi-Fi)

위치 확인(📍)과 음성 입력(🎤)은 브라우저 정책상 **HTTPS(또는 localhost)에서만** 동작합니다.
폰에서 전 기능을 쓰려면 동봉된 HTTPS 프록시를 함께 띄우세요:

```bash
npm run dev            # 앱 서버 (기본 3000. npm start도 가능)
npm run https-proxy    # → https://<내부IP>:3443 (TARGET_PORT로 대상 포트 변경 가능)
```

- 폰 브라우저에서 `https://<내부IP>:3443` 접속 → 자체 서명 인증서 경고를 1회 수락("고급 → 계속").
- 인증서는 `certs/`에 자동 생성되며 내부 IP가 바뀌면 자동 재발급됩니다 (git 제외됨).

## 실배포 (HTTPS 필수)

모든 사용자가 위치·음성 기능을 쓰려면 반드시 HTTPS 도메인으로 배포해야 합니다.

**옵션 A — 단일 서버 셀프호스팅 (권장, 현재 설계 그대로 동작)**

```bash
npm run build && PORT=3000 npm start
```

앞단에 Caddy(자동 Let's Encrypt) 또는 Nginx+certbot 리버스 프록시를 두면 끝입니다.
자동배정 워커(instrumentation)가 프로세스 안에서 그대로 돌고, 만약을 대비해 시스템 cron 백업도 걸 수 있습니다:

```bash
*/1 * * * * curl -s -X POST -H "x-cron-secret: $CRON_SECRET" https://<도메인>/api/internal/auto-assign
```

Caddyfile 예시:

```
전기출동.example.com {
    reverse_proxy localhost:3000
}
```

**옵션 B — Vercel**

HTTPS는 자동이지만 서버리스 환경이라 `setInterval` 워커가 돌지 않습니다.
반드시 **Vercel Cron**으로 자동배정을 대신 트리거하세요 (`/api/internal/auto-assign`은
Vercel Cron의 `Authorization: Bearer CRON_SECRET` 방식도 지원):

```json
// vercel.json
{ "crons": [{ "path": "/api/internal/auto-assign", "schedule": "* * * * *" }] }
```

환경변수 `CRON_SECRET`을 Vercel 프로젝트에 설정하면 Cron 요청에 자동으로 Bearer 토큰이 붙습니다.
DB는 Neon/Supabase 등 매니지드 PostgreSQL을 `DATABASE_URL`로 연결합니다.
