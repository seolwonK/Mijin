# 본인확인 보안 점검 컬렉션

본인확인서비스 이용기관 웹사이트 취약점 자체점검 7개 항목을 **실행 중인 서버에 대고** 검증한다.
코드를 읽어 판정하는 것이 아니라 실제 응답으로 판정하므로, 배포본이 소스와 어긋나면 여기서 드러난다.

| 파일 | 역할 |
|---|---|
| `mijin-identity-security.postman_collection.json` | 컬렉션 본체 (요청 16개 · 단언 124개) |
| `mijin-local.postman_environment.json` | 로컬(`npm run dev`, provider=mock) |
| `mijin-production.postman_environment.json` | 운영(전기아저씨.com, provider=portone) |
| `tls-check.sh` | TLS 프로토콜 버전·인증서 — Postman 이 못 하는 부분 |

## 실행

```bash
npm run test:security          # 로컬 (dev 서버가 :3000 에 떠 있어야 함)
npm run test:security:prod     # 운영 — 읽기 전용, 데이터를 만들지 않는다
npm run test:tls               # 운영 TLS·인증서·헤더 실측
```

Postman GUI 를 쓴다면 컬렉션과 환경 파일을 Import 한 뒤 환경을 고르고 Run 하면 된다.
CI 에 넣을 때는 `--reporters cli,junit --reporter-junit-export report.xml` 을 붙인다.

## 자체점검 항목과의 대응

폴더 번호가 곧 항목 번호이고, 단언 이름의 `[n번]` 도 같다.

| 항목 | 무엇을 실제로 확인하는가 | 어디서 판정되나 |
|---|---|---|
| 1 · 평문 노출 | 인증 응답 키가 `{ok, verificationId, name, phone}` 뿐이고, JSON·HTML·JS 번들 어디에도 CI/DI 가 없다 | 로컬·운영 |
| 2 · 파라미터 변조 | 위조한 거래번호로는 인증이 성립하지 않고, 함께 보낸 이름·번호가 결과로 승격되지 않는다 | **운영 전용**<br>(mock 은 설계상 입력값을 신뢰) |
| 3 · 입력정보 일치 | 인증 실명·번호와 다른 값으로 가입하면 각각 전용 문구로 400 | **로컬 전용**<br>(인증 토큰을 만들 수 있어야 함) |
| 4 · 데이터 재사용 | ① 발급된 적 없는 토큰은 거부 ② 같은 인증으로 두 번 가입 불가 | ①은 양쪽, ②는 로컬 전용 |
| 5 · 암호키 노출 | 설정 API 가 허용 키만 내려주고, JS 번들에 서버 비밀이 없다 | 로컬·운영 |
| 6 · 접근통제 | 가드 라우트 64개 전부 무세션 401 + 보호 화면 3종 리다이렉트 + 공개 라우트 양성대조 | 로컬·운영 |
| 7 · 안전한 통신 | 평문 HTTP → HTTPS 강제, 보안 응답 헤더 5종 | 운영<br>(프로토콜 버전은 `tls-check.sh`) |

**로컬과 운영을 모두 돌려야 7항목이 채워진다.** 2번은 실제 대행사가 붙은 운영에서만,
3번과 4번②는 인증 토큰을 만들 수 있는 로컬 mock 에서만 판정된다.
한쪽에서 판정 불가한 항목은 조용히 통과시키지 않고 "판정 보류" 단언으로 남겨, 리포트에서 눈에 띄게 했다.

## 설계 — 왜 요청이 16개뿐인가

- **반복 검사는 요청을 쪼개지 않는다.** 가드 라우트 64개와 JS 번들 20개는 각각 한 요청의 테스트
  스크립트 안에서 `pm.sendRequest` 로 돈다. 실패하면 어떤 `(메서드 경로)` 가 뚫렸는지 단언 메시지에
  전부 찍히므로, 요청을 64개로 늘려 얻을 것이 없다.
- **공통 검사는 컬렉션 레벨에 있다.** 보안 응답 헤더 5종, 서버 시크릿 유출, CI/DI 누출은
  컬렉션 테스트 스크립트라 **모든 응답에 자동으로 걸린다.** 요청을 추가하면 커버리지가 따라온다.
- 그 결과 전체 실행이 로컬 5초, 운영 30초 안에 끝난다.

## 안전성 — 무엇을 만들고 무엇을 안 만드나

기본 실행은 **거부 경로만** 태운다. 계정도 접수도 만들지 않는다.

유일한 예외가 `04 · 데이터 재사용` 의 단회성 증명이고, 두 조건을 **모두** 만족할 때만 실행된다.

1. 환경변수 `allowAccountCreation=true`
2. `provider=mock` — 운영은 portone 이라 켜도 자동으로 건너뛴다

```bash
npm run test:security -- --env-var allowAccountCreation=true
```

생성 계정은 `9001-postman-*` / `0109001***` 으로 이 레포의 일회성 픽스처 대역이라,
다음 E2E 실행의 `pretest-guard` 스윕이 회수한다. 즉시 지우려면:

```sql
DELETE FROM "EmploymentContract" WHERE "technicianId" IN (
  SELECT t.id FROM "Technician" t JOIN "User" u ON u.id=t."userId"
  WHERE u."loginId" LIKE '9001-postman-%');
DELETE FROM "Technician" WHERE "userId" IN (
  SELECT id FROM "User" WHERE "loginId" LIKE '9001-postman-%');
DELETE FROM "User" WHERE "loginId" LIKE '9001-postman-%';
```

자동배정을 실제로 돌리는 `/api/internal/auto-assign` 은 어떤 스윕에서도 호출하지 않는다.

### 레이트리밋

6개 라우트가 클라이언트가 준 `X-Forwarded-For` 를 프록시 allowlist 없이 그대로 버킷 키로 쓴다.
로컬 환경은 `spoofClientIp=true` 로 요청마다 IP 를 바꿔 반복 실행에서 429 를 피한다.
**운영 환경은 `false`** 다 — 정직하게 측정하기 위함이며, 운영에서 레이트리밋 대상 라우트를 태우는 요청은
`identity/verify` 2회, `tech/signup` 2회뿐이라 한도(10회·5회)에 닿지 않는다.

## 실측 비밀값 대조 (선택, 권장)

환경변수 `secretsToScan` 에 실제 값을 쉼표로 넣으면, **모든 응답과 모든 JS 번들**에서 그 값을 찾는다.
5번 항목의 가장 강한 형태다.

```bash
npm run test:security:prod -- --env-var "secretsToScan=$PORTONE_API_SECRET,$AUTH_SECRET"
```

⚠️ 값을 채운 환경 파일은 절대 커밋하지 말 것. 기본값은 비어 있고, 비어 있으면 이 검사는 건너뛴다.

## 라우트가 늘어나면

컬렉션 변수 `guardedRoutes` 는 `tests/helpers/routes.ts` 의 가드 대상 64개를 옮겨 담은 것이다.
라우트를 추가하면 이 값도 갱신해야 한다. 원본이 실제 소스와 어긋나는지는 E2E 의
`tests/cross/matrix-completeness.spec.ts` 가 지키므로, 그 테스트가 빨개지면 여기도 함께 손볼 차례다.

```bash
npx tsx -e "import {GUARDED_ROUTES} from './tests/helpers/routes';\
 console.log(JSON.stringify(GUARDED_ROUTES.map(r=>({path:r.path,method:r.method,role:r.role}))))"
```

## 최근 실측 (2026-08-28)

| 대상 | 결과 |
|---|---|
| 로컬 (mock, `allowAccountCreation=true`) | 요청 105건 · **단언 124/124 통과** (4.7초) |
| 운영 (portone) | 요청 95건 · 항목별 단언 전부 통과, **전역 보안 헤더 단언만 실패**(응답 12건 × 5종) |

운영의 헤더 실패는 `next.config.ts` 의 `headers()` 가 **아직 배포되지 않았기 때문**이다.
재배포 후 다시 돌리면 사라진다 — 컬렉션이 배포 상태를 정확히 짚은 것이다.
