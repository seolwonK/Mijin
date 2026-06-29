# 구현 계획: 미진전기 긴급 출동 디스패치 플랫폼

- Plan ID: mijin-dispatch-plan
- **Status: pending approval** (consensus 도달 — Critic APPROVE 조건 충족. 실행은 별도 명시 승인 필요)
- Mode: omc-plan consensus (`--direct`) — Planner 산출물, **Rev 3** (Architect SOUND_WITH_CONCERNS + Critic 2회 리뷰 반영, 합의 도달)
- Source Spec: `/Users/seolwon/IdeaProjects/mijin/.omc/specs/deep-interview-mijin-dispatch.md` (Ambiguity 17.5%, PASSED)
- Project: greenfield (`/Users/seolwon/IdeaProjects/mijin`, 소스 없음, IntelliJ 스텁만 존재)
- Generated: 2026-06-28 / Revised: 2026-06-28 (consensus Rev 2 → Rev 3)
- Stack: **Option A 확정** (Architect/Critic 모두 인정) — 변경 없음
- Consensus 경과: Planner 초안 → Architect(SOUND_WITH_CONCERNS) → Critic(REJECT, 9 fixes) → Rev 2 → Critic 재검증(thin REJECT, 1 blocking) → Rev 3 upsert 패치 → **APPROVE 조건 충족**
- 개정 내역: §Changelog 참조

---

## 1. Requirements Summary

3자 마켓플레이스형 긴급 전기고장 출동 디스패치 플랫폼. 행위자: **고객(전기업체)**, **외부 등록 출동업체(다수) + 소속 기사**, **미진(최고 관리자)**.

핵심 흐름:
1. 고객이 고장 신고 + **긴급도 직접 선택**(초긴급/긴급/일반).
2. 시스템이 **위치·가용성·긴급도** 기준으로 출동업체 **자동 매칭**(순차 단일 오퍼, §3.5).
3. 업체 **수락/거절**, 거절·무응답(응답기한 초과) 시 **다음 적합 업체로 자동 재배정**.
4. 업체가 수락 시 **소속 기사 1명 지정**(바인딩), 기사가 현장에서 **'도착'·'완료' 버튼** 자가 보고.
5. **SLA**: 초긴급 ≤ 60분, 긴급 ≤ 120분 (측정구간 = 업체 **수락 시각 → 기사 '도착' 탭 시각**). **임박 시 알림만**, **위반 시 알림 + 자동 재배정**.
6. **온보딩**: 출동업체·고객 셀프가입 → **관리자 승인** 후 활성화.
7. **플랫폼**: 3개 화면(고객/기사/관리자) 모두 **단일 반응형 모바일 우선 웹** 코드베이스.
8. **알림**: 웹 푸시/PWA 및/또는 SMS.

엔티티 8개: Customer, DispatchCompany, ServiceRequest, Assignment, Technician, Admin, SLATarget, Notification.

### Non-Goals (명시적 범위 밖)
- ❌ 시스템 결제 연동 (결제는 업체↔고객 **대면** 거래)
- ❌ 업체 페널티/평점 시스템 (v1 미포함)
- ❌ 네이티브 모바일 앱 (반응형 웹으로 대체)
- ❌ GPS 기반 도착 자동 감지 (기사 버튼 자가 보고로 대체)

---

## 2. RALPLAN-DR Summary

### Principles (설계 지배 원칙)
1. **SLA 약속이 시스템의 존재 이유다.** 타이머·만료·재배정은 best-effort가 아니라 **내구성(durability) 보장** 대상. 서버/워커 재시작에도 마감시한은 유실되지 않는다. **단일 워커에 의존하지 않는다**(§3.6: 정합성은 DB가, 가용성은 워커 N≥2 + out-of-process 스위퍼가 담당).
2. **단일 진실 원천 + 상태 머신.** ServiceRequest/Assignment의 **모든 전이는 명시적 상태 머신 + DB 제약**으로 강제한다. 중복배정·잘못된 전이·breach 후 재오픈까지 전부 **스키마 레벨**(부분 unique index + 상태 가드 UPDATE)에서 차단/강제.
3. **모바일 우선, 단일 코드베이스.** 3개 역할 화면 = 하나의 반응형 웹 앱 + 역할 라우팅.
4. **외부·인프라 의존성은 인터페이스 뒤로 추상화하라.** 알림(push/SMS)은 채널 추상화, **지오 후보 탐색은 `CandidateFinder` 인터페이스**(PostGIS 구현을 그 뒤로) — 단, 거리 계산 자체는 in-DB 예외로 수용(쿼리를 앱으로 끌어내지 않음). graceful fallback 보장.
5. **최소 범위 v1.** 결제·평점·네이티브는 비목표. 자동매칭은 필수지만 "거리+가용성 랭킹 + 순차 단일 오퍼"로 단순 시작, 점진 고도화(broadcast-to-K는 향후 옵션).

### Decision Drivers (top 3)
1. **SLA 타이머 신뢰성**(재시작·워커 장애 견딤) — 스택/토폴로지 1순위 축.
2. **greenfield v1 개발 속도**(단일 언어·단일 배포).
3. **실시간성 + 동시성 안전**(중복배정 방지, 상태 실시간 전파).

### Viable Options (요약 — 상세 Rev 1 동일)
- **Option A ⭐채택·확정** — Next.js 풀스택(TS) + PostgreSQL/PostGIS + pg-boss 내구성 워커 + web-push/SMS 어댑터 + **폴링 1순위/SSE**. Architect·Critic 모두 타당 인정.
- **Option B** — SPA+NestJS+BullMQ/Redis 3-tier. Redis 추가·다중 코드베이스로 v1 속도↓, 큐/DB 이중 진실원천 부담 → **초고부하 시 마이그레이션 후보로 보류**.
- **Option C** — Spring Boot(Kotlin)+React+Quartz(JVM). 스케줄 신뢰성 최상이나 2언어·2코드베이스로 v1 속도 최저 → **JVM 전문팀·장기 엔터프라이즈 1순위일 때 재고**.

근거: pg-boss가 SLA 잡을 DB와 **단일 트랜잭션 경계**에서 영속화해 Driver 1을, 단일 TS 모놀리스가 Driver 2를, 동일 DB 락 + 폴링이 Driver 3을 균형 충족. (전체 ADR §끝.)

---

## 3. Recommended Architecture

### 3.1 추천 스택
| 레이어 | 선택 | 이유 |
|--------|------|------|
| 앱 프레임워크 | **Next.js 14+ (App Router, React 18, TS)** | 단일 코드베이스 3개 반응형 화면 + API. PWA·모바일 우선 |
| DB | **PostgreSQL 16 + PostGIS** | 관계형 정합성 + 지오. 단일 DB가 큐까지 수용 |
| ORM | **Prisma** (+ raw SQL: PostGIS·부분/공간 인덱스·상태가드 UPDATE) | 타입 안전 + 제약은 마이그레이션 SQL |
| 큐/스케줄 | **pg-boss** (Postgres delayed job, 내부 `FOR UPDATE SKIP LOCKED`) | SLA 마감·응답 타임아웃·재배정. 재시작 내구성, 인프라 0, **워커 N≥2 안전 소비** |
| 워커 | **Node 워커 N≥2 복제본** (`/worker`) | pg-boss 컨슈머. 정합성은 DB가 보장하므로 수평 복제 가능(SPOF 제거) |
| 보강 스위퍼 | **pg_cron (DB-driven) 1순위 / 외부 cron 폴백** | 워커와 **다른 장애도메인**. 누락 잡 회수(§3.6) |
| 인증 | 세션(Auth.js Credentials 또는 JWT+httpOnly) + RBAC + 승인상태 게이팅 | 4역할 + pending/approved/rejected |
| 실시간 | **DB 폴링(≤5s, 1순위)** + LISTEN/NOTIFY(선택 강화) | §3.7. 모바일웹 단순·예측가능 |
| 푸시 | web-push(VAPID) | PWA 푸시. iOS는 설치형 PWA(16.4+)만 → SMS 폴백 |
| SMS | provider 인터페이스 + 국내 게이트웨이 어댑터 | 중요 SLA 경고 신뢰 채널 |
| 배포 | 웹 컨테이너 + 워커 컨테이너(N≥2) + 관리형 Postgres | 워커 long-running → 순수 서버리스 비채택 |
| 테스트 | Vitest + Playwright + Testcontainers | 상태 머신·매칭·SLA·내구성 검증 |

### 3.2 모듈/서비스 구성
- `web` (Next.js): 3개 역할 화면 + API route handlers + 폴링/SSE 엔드포인트.
- `worker` (Node, **N≥2 복제본**): pg-boss 컨슈머 — 응답 타임아웃→재배정, SLA 임박→**알림만**, SLA 마감→**위반 처리(알림+재배정)**. 정합성은 DB 제약이 보장하므로 복제본 간 안전(SKIP LOCKED + 상태가드 idempotent 핸들러).
- `sweeper` (pg_cron/외부 cron, **워커와 분리된 장애도메인**): 누락 마감 회수(§3.6).
- `domain` (공유): 엔티티 타입, 상태 머신, 전이 가드, 긴급도/시한/응답기한 상수.
- `matching` 엔진: `CandidateFinder`(지오 후보) + 랭킹 → 순차 단일 오퍼 결정(§3.5).
- `notifications`: 채널 추상화(push/SMS) + 템플릿 + fan-out + 결과 로깅/재시도.
- `sla`: 시한 계산(measure_start/end, deadline_at, imminent_at), 위반 판정.

### 3.3 데이터 모델 (8 엔티티 → 스키마 초안)

> 위치 = `geography(Point,4326)` + 주소 텍스트 병행.

**customers** — `id PK, business_name, contact_phone, address_text, location geography, approval_status enum(PENDING|APPROVED|REJECTED), created_at, approved_at, approved_by FK→admins`

**dispatch_companies** — `id PK, business_name, contact_phone, service_area_center geography, service_radius_m int, online bool default false, approval_status enum(PENDING|APPROVED|REJECTED), created_at, approved_at, approved_by FK→admins`
- 가용성 = `online=true` AND 활성 배정(PROPOSED|ACCEPTED) 미보유(BUSY 파생). §3.5 후보 필터.

**technicians** — `id PK, company_id FK→dispatch_companies, name, contact_phone, active bool`

**admins** — `id PK, name, email, role enum(SUPER_ADMIN|OPERATOR), created_at`

**service_requests** — `id PK, customer_id FK, urgency enum(CRITICAL|URGENT|NORMAL), fault_type, location geography, address_text, status enum(SUBMITTED|MATCHING|ACCEPTED|ARRIVED|COMPLETED|CANCELLED), needs_manual bool default false, submitted_at, accepted_at, arrived_at, completed_at`
- ⚠️ **`current_assignment_id` 제거**(역정규화 드리프트 방지). 활성 배정은 `assignments WHERE service_request_id=? AND status IN(PROPOSED,ACCEPTED)`로 **파생**(부분 unique index가 최대 1개 보장). [Critic #9]

**assignments** — `id PK, service_request_id FK, company_id FK, technician_id FK→technicians NULLABLE, status enum(PROPOSED|ACCEPTED|DECLINED|TIMED_OUT|REASSIGNED|CANCELLED), proposed_at, response_deadline_at, responded_at, sequence int`
- `technician_id`는 **ACCEPT 시점에 업체가 지정한 기사로 바인딩**(§3.4, [Architect #4]).
- **부분 unique index** `(service_request_id) WHERE status IN ('PROPOSED','ACCEPTED')` → 동일 건 활성 배정 1개. **순차 단일 오퍼 모델에 결합된 제약**(§3.5). broadcast-to-K로 전환 시 이 index를 K-concurrent 허용으로 완화 필요(향후).

**sla_targets** — `id PK, service_request_id FK UNIQUE, urgency, target_minutes int(60|120), measure_start_at(=accepted_at), measure_end_at(=arrived_at), deadline_at, imminent_at, breached bool default false`
- **NORMAL은 행 자체를 생성하지 않음**(하드 SLA 없음, §Business Decisions). target_minutes는 60|120만.

**notifications** — `id PK, recipient_type enum(CUSTOMER|COMPANY|ADMIN), recipient_id, type enum(MATCH_PROPOSED|STATUS_CHANGE|SLA_IMMINENT|SLA_BREACH|REASSIGNED|APPROVAL_RESULT), channel enum(PUSH|SMS), payload jsonb, status enum(QUEUED|SENT|FAILED), created_at, sent_at`

**push_subscriptions** (보조) — `id PK, owner_type, owner_id, endpoint, p256dh, auth, created_at`

### 3.4 상태 머신 (완성본)

**ServiceRequest** (고객 라벨 매핑 포함, breach 재오픈 엣지 포함):
```
SUBMITTED(접수)
   │ 매칭 엔진이 첫 후보 선정 → 첫 오퍼(Assignment PROPOSED)
   ▼
MATCHING(매칭중) ──(후보 소진)──► needs_manual=true (관리자 에스컬레이션; 상태는 MATCHING 유지)
   │ 업체 ACCEPT (+ 소속 기사 지정 → technician_id 바인딩)
   ▼
ACCEPTED(수락/출동중)   ← SLA 측정 시작(measure_start=accepted_at, deadline_at 설정; CRITICAL/URGENT만)
   ├─ 기사 '도착' 탭 ──► ARRIVED(도착)   ← SLA 시계 정지. **이후 재배정 없음**
   └─ SLA 위반(워커; status=ACCEPTED & 미도착 한정) ──► **MATCHING(재오픈)**
            [기존 Assignment → REASSIGNED, sla_targets.breached=true, 알림(고객+관리자), 새 오퍼]
   ▼
ARRIVED(도착)
   │ 기사 '완료' 탭
   ▼
COMPLETED(완료) [terminal]

임의 비terminal → CANCELLED(취소) [terminal]  (고객/관리자 취소)
```
- **breach 재오픈 엣지는 status='ACCEPTED'일 때만 발화**(가드 UPDATE의 `WHERE status='ACCEPTED'`). ARRIVED/COMPLETED면 rowcount=0 → **no-op**(도착한 트럭 회수 안 함, [Architect #3]).
- **NORMAL은 breach 엣지 없음**(sla_targets 미생성 → breach 잡 미예약).
- 고객 6-라벨: 접수=SUBMITTED, 매칭중=MATCHING, 수락=ACCEPTED, 출동중=ACCEPTED(라벨), 도착=ARRIVED, 완료=COMPLETED.

**Assignment**:
```
PROPOSED(제안)  [response_deadline_at 설정 + response-timeout 잡 예약]
   ├─ 업체 ACCEPT(기사 지정) ─► ACCEPTED  → SR ACCEPTED 전이, technician_id 바인딩, 타임아웃 잡 취소, SLA 잡 예약
   ├─ 업체 DECLINE ─► DECLINED  → 다음 후보로 재배정(새 PROPOSED, sequence+1)
   ├─ 응답기한 초과(워커) ─► TIMED_OUT → 다음 후보로 재배정
   ├─ SLA 위반 재오픈(워커) ─► REASSIGNED(supersede) → SR 재오픈, 새 후보로 오퍼
   └─ 관리자 수동 개입 ─► CANCELLED 또는 REASSIGNED
```

### 3.5 매칭 오퍼 방식 — 명시적 결정 (DECISION) [Critic #7]

- **DECISION: 순차 단일 오퍼(sequential single-offer).** 한 시점에 한 신고당 **활성 오퍼 1개**만. 거절/타임아웃/위반 시 다음 후보로 1개씩 진행. 부분 unique index `(service_request_id) WHERE status IN(PROPOSED,ACCEPTED)`는 **이 모델에 결합된 정당한 제약**(동시 활성 오퍼 0~1 보장 = 중복배차 차단). 변경 불필요.
- **후보 필터**: `approval_status=APPROVED AND online=true AND 활성배정 미보유(not BUSY) AND ST_DWithin(service_area_center, request.location, service_radius_m)`. 랭킹: 거리 오름차순 → 동거리 시 부하 적은 업체.
- **향후 옵션(노트)**: broadcast-to-K(K개 동시 오퍼 + first-accept-wins via `FOR UPDATE`). 채택 시 부분 unique index를 K-concurrent PROPOSED 허용 + accept 시 나머지 supersede로 완화. v1 비채택(복잡도·이중 응답 처리).

#### SLA 예산 수학
- **스펙 기준 SLA 시계 = 수락→도착**(60/120분 전부 **이동 예산**). 매칭 hop(응답 타임아웃)은 **수락 이전(MATCHING)** 에 발생 → SLA 시계를 직접 소모하지 않음.
- 매칭 phase(신고→수락) 응답기한 hop당(§Business Decisions): **초긴급 3분 / 긴급 5분 / NORMAL 15분**, **hop 상한 3회**(초과 시 needs_manual 에스컬레이션).
- 계산:

| 긴급도 | hop/회 | 최대 hop | 매칭 최악(신고→수락) | SLA 이동예산(수락→도착) | 고객체감 최악(신고→도착) |
|--------|--------|----------|----------------------|--------------------------|---------------------------|
| 초긴급 | 3분 | 3 | ≤ 9분 | 60분(전액 이동) | ≤ 69분 |
| 긴급 | 5분 | 3 | ≤ 15분 | 120분(전액 이동) | ≤ 135분 |
| NORMAL | 15분 | 3 | ≤ 45분 | (하드 SLA 없음) | best-effort |

→ 초긴급은 3hop(9분) 모두 소진해도 SLA 60분은 **온전히 이동에 사용**되며(시계는 수락부터), 매칭 지연은 고객체감 리드타임에만 +9분. hop 상한이 무한 재배정을 막아 예산 폭주 방지.

### 3.6 SLA 타이머 내구성 & 워커 토폴로지 [Architect #1 / Principle 1]

- **정합성(correctness) = DB가 보장**: ① 부분 unique index(활성 배정 1개), ② 전이 트랜잭션 `SELECT ... FOR UPDATE`(ServiceRequest 행 락), ③ **상태 가드 UPDATE + rowcount 분기**(idempotent 핸들러, §3.8). → 이 불변식 덕에 워커는 **무상태·수평복제 안전**.
- **가용성(availability) = 워커 N≥2 복제본**: pg-boss가 내부 `FOR UPDATE SKIP LOCKED`로 잡을 배타 소비 → 복제본이 동시에 떠도 한 잡은 한 번만 처리(이중 발화해도 상태가드로 무해). **"단일 컨슈머=경합 차단" 프레이밍 폐기** — 경합은 DB가, 처리량/가용성은 복제가 담당.
- **보강 스위퍼 = 분리된 장애도메인**: **pg_cron**(DB 내부 스케줄, Node 워커와 다른 장애도메인) 1순위, 외부 cron→내부 admin 엔드포인트 폴백. 주기(예: 30초) 스캔:
  `deadline_at < now() AND breached=false AND status(SR)=ACCEPTED` → 누락 breach 잡 enqueue(idempotent). pg-boss 잡 유실/워커 전면 다운 시에도 SLA 위반이 회수됨.
- **내구성 테스트**: 잡 예약 → 워커 전부 kill → DB만 생존 → 워커 재기동 시 미실행 잡 자동 재개; 워커 영구 다운 시 스위퍼가 회수.

### 3.7 실시간 전파 명세 [Critic #5]

- **DECISION: DB 폴링 1순위.** 클라이언트가 상태 엔드포인트를 **3~4초 간격 폴링로 핀**(worst-case가 AC10 ≤5s를 엄격 충족; 5초 핀은 지터로 초과 가능 → 회피). 단순·예측가능·풀링 호환.
- **선택적 강화: PostgreSQL LISTEN/NOTIFY** + SSE로 푸시. ⚠️ **주의: PgBouncer transaction-pooling 모드는 LISTEN/NOTIFY를 깨뜨림**(세션 고정 필요) → 채택 시 session-pooling 또는 전용 NOTIFY 커넥션 필요. v1 기본은 폴링이므로 풀러 모드 제약 없음.
- 워커→웹 전파 경로: 워커는 DB만 갱신(상태/알림) → 웹은 폴링으로 읽음(공유 인프라 없음, 결합도 0).

### 3.8 핸들러 가드 (명시적 동시성 제어) [Critic #9]

- **ACCEPT** (업체가 기사 tech 지정):
  ```sql
  UPDATE assignments SET status='ACCEPTED', technician_id=$tech, responded_at=now()
   WHERE id=$aid AND status='PROPOSED' RETURNING id;     -- rowcount=0 → 409(만료/취소/타응답), 무변경
  -- rowcount=1 → 동일 트랜잭션:
  UPDATE service_requests SET status='ACCEPTED', accepted_at=now()
   WHERE id=$sr AND status='MATCHING';
  -- ⚠️ UPSERT 필수: sla_targets.service_request_id가 UNIQUE이므로 재수락 시 plain INSERT는 UNIQUE 위반→breach 복구 경로 영구 차단.
  INSERT INTO sla_targets(service_request_id, urgency, measure_start_at, deadline_at, imminent_at, breached, measure_end_at)
  VALUES($sr, $urg, now(), $deadline, $imminent, false, NULL)   -- urgency IN(CRITICAL,URGENT)만
  ON CONFLICT (service_request_id) DO UPDATE
     SET measure_start_at=now(), deadline_at=$deadline, imminent_at=$imminent, breached=false, measure_end_at=NULL;
  -- 부분 unique index가 동일 SR 동시 ACCEPTED를 스키마에서 차단
  ```
  - **Fresh SLA clock (deliberate policy, 기본값=BD7)**: 재배정된 **새 업체는 fresh SLA 윈도우**(measure_start=재수락 시각, deadline=재수락+60/120)를 받는다. accepted_at 리셋과 일관. ⇒ **post-breach 고객 누적 대기는 명목 60/120분을 초과할 수 있음**(예: 초긴급 60분 breach + 새 업체 60분 = 최대 ~120분+α). 누적(cumulative) 회계 원하면 BD7에서 override.
- **BREACH** (워커):
  ```sql
  UPDATE service_requests SET status='MATCHING'
   WHERE id=$sr AND status='ACCEPTED' RETURNING id;       -- ARRIVED/COMPLETED면 rowcount=0 → no-op(도착 트럭 회수 안 함)
  -- rowcount=1 → 동일 트랜잭션:
  UPDATE assignments SET status='REASSIGNED'
   WHERE service_request_id=$sr AND status='ACCEPTED';
  UPDATE sla_targets SET breached=true WHERE service_request_id=$sr;
  -- 알림(고객+관리자) enqueue, 재배정 잡 enqueue
  ```
- **ARRIVE**: `UPDATE assignments SET ... WHERE id=$aid AND status='ACCEPTED' AND technician_id=$me RETURNING id` (권한=바인딩된 기사/업체관리자) → SR ARRIVED, sla_targets.measure_end=now, breach 잡 취소.
- **DECLINE / TIMEOUT → REASSIGN** (ACCEPT/BREACH/ARRIVE와 동일하게 순서 명시): 동일 트랜잭션에서 **① 기존 배정 retire 먼저** `UPDATE assignments SET status='DECLINED'(또는 'TIMED_OUT') WHERE id=$aid AND status='PROPOSED' RETURNING id` (rowcount=0이면 이미 처리됨→no-op) → **② 그 다음 새 PROPOSED insert** `INSERT INTO assignments(... status='PROPOSED', sequence=$seq+1 ...)`. retire→insert 순서로 부분 unique index(활성 1개) 위반 방지.
- **hop-cap 리셋 (Recommended #1, 기본값)**: **breach 재오픈은 매칭 hop 예산을 리셋한다**(새 매칭 라운드 = fresh hop, §3.5 상한 3 재시작). 안 그러면 hop 3 소진→수락→breach 건이 재오픈 즉시 needs_manual로 빠져 복구 불가. 응답 hop 카운트는 (재오픈 라운드 단위로) 0부터.
- 모든 핸들러 **idempotent**: 중복/지연 발화는 rowcount=0으로 흡수.

---

## 4. Implementation Steps (마일스톤 / 의존성 순서)

> greenfield: 모든 경로는 **생성할 경로**. 루트 = `/Users/seolwon/IdeaProjects/mijin`. 의존성: M0 → M1 → M2 → (M3, M6 일부 병행) → M4 → M5 → M7 → M8.

### 제안 디렉토리 구조
```
/ (repo root)
  package.json  tsconfig.json  next.config.mjs  .env.example  docker-compose.yml  Dockerfile.web  Dockerfile.worker
  /prisma  schema.prisma  /migrations/(PostGIS·부분index·pg_cron)  seed.ts
  /src
    /app
      /(customer)/ ...   /(company)/ ...   /(admin)/ ...
      /api/ ...          layout.tsx  globals.css
    /lib
      /db/   /auth/   /matching/(candidate-finder.ts, engine.ts)
      /sla/  /notifications/(channel.ts, push.ts, sms.ts, templates/)
      /queue/(pg-boss)   /realtime/(폴링 엔드포인트, 선택 SSE)
    /domain/(enums, state-machine 가드, 상수: 시한/응답기한/hop상한)
    /components/
  /worker  index.ts  /jobs/(response-timeout.ts, sla-imminent.ts, sla-breach.ts, reassign.ts)
  /sweeper  sweeper.sql(pg_cron) | cron-handler 엔드포인트
  /public  manifest.webmanifest  sw.js  /icons
  /tests  /unit  /integration  /e2e
```

### M0 — 스캐폴딩 & 인프라
- Next.js+TS, Prisma, PostgreSQL+PostGIS(docker-compose), **pg-boss + pg_cron 확장**, PWA 셸, CI(lint/typecheck/test).
- 파일: `package.json`, `next.config.mjs`, `docker-compose.yml`, `prisma/schema.prisma`, `src/lib/db/index.ts`, `src/lib/queue/index.ts`, `public/manifest.webmanifest`, `public/sw.js`, `.github/workflows/ci.yml`.
- 완료: dev 기동, DB 연결, pg-boss 큐 + pg_cron 활성.

### M1 — 데이터 모델 & 마이그레이션
- 8 엔티티 + push_subscriptions, enum, **부분 unique index**, PostGIS 확장/공간 인덱스, `current_assignment_id` 미생성(파생), seed.
- 파일: `prisma/schema.prisma`, `prisma/migrations/*`, `prisma/seed.ts`, `src/domain/enums.ts`, `src/domain/state-machine.ts`.
- 완료: 부분 unique index가 중복 활성배정 INSERT 거부(통합 테스트).

### M2 — 인증·RBAC·온보딩/승인
- 셀프가입(고객/업체+기사), 세션, 역할 가드, **승인상태 게이팅**(PENDING 비활성), 관리자 승인/거절.
- 파일: `src/lib/auth/*`, `src/app/api/auth/*`, `src/app/(customer)/signup`, `src/app/(company)/signup`, `src/app/api/admin/approvals/*`, `src/app/(admin)/approvals`.
- 완료: PENDING 로그인 차단, 승인 후 활성, 역할별 접근 제어.

### M3 — 신고 생성 + 긴급도 + 고객 상태조회
- 고객 신고 폼(긴급도·위치/주소·고장유형), SR 생성(SUBMITTED), 상태조회 화면(6-상태, **폴링 ≤5s**).
- 파일: `src/app/(customer)/requests/new`, `src/app/api/requests/*`, `src/app/(customer)/requests/[id]`, `src/lib/realtime/poll.ts`.
- 완료: SUBMITTED·긴급도 저장, 상태 변경 ≤5초 반영(폴링).

### M4 — 매칭 엔진 + Assignment(수락/거절) + 자동 재배정 + 기사 바인딩
- `CandidateFinder`(PostGIS 후보) + 랭킹 → 첫 오퍼 PROPOSED + 응답기한(hop별) + `response-timeout` 잡, **업체 수락 시 소속 기사 지정→technician_id 바인딩**, 거절/무응답 시 다음 후보 재배정(워커 N≥2, SKIP LOCKED), 후보 소진 시 needs_manual, hop 상한.
- 파일: `src/lib/matching/candidate-finder.ts`, `src/lib/matching/engine.ts`, `src/app/api/assignments/*`, `worker/jobs/response-timeout.ts`, `worker/jobs/reassign.ts`, `src/app/(company)/inbox`.
- 완료: 제출→후보 ≤5초(p95), 수락 시 활성배정 1개+기사 바인딩+SR ACCEPTED, 거절/타임아웃 시 다음 PROPOSED, 동시 수락 시 정확히 1건(부분 unique index).

### M5 — SLA 타이머·만료 워커 + 도착/완료 + 위반 재배정
- 수락 시 SLATarget 생성(CRITICAL/URGENT만) + `sla-imminent`(**알림만**)/`sla-breach`(**알림+재배정**) 잡 예약, **pg_cron 스위퍼**(누락 회수), 기사 '도착'(권한=바인딩 기사/업체관리자; 시계 정지·breach 잡 취소)/'완료'(COMPLETED), **위반 재배정은 ACCEPTED-미도착 한정**(ARRIVED no-op).
- 파일: `src/lib/sla/*`, `worker/jobs/sla-imminent.ts`, `worker/jobs/sla-breach.ts`, `sweeper/sweeper.sql`, `src/app/api/assignments/[id]/arrive`, `.../complete`, `src/app/(company)/jobs/[id]`.
- 완료: deadline=수락+60/120분, '도착' 시계 정지, **워커 kill→재기동/스위퍼 회수 시 위반 발화**, 임박=알림만/위반=알림+재배정, ARRIVED 재배정 안 함.

### M6 — 알림 (웹푸시 + SMS)
- 채널 추상화, web-push(VAPID) 구독·발송, SMS 어댑터, 템플릿, fan-out + 결과 로깅·재시도, 단말 미지원 시 SMS 폴백.
- 파일: `src/lib/notifications/{channel,push,sms,templates}.ts`, `src/app/api/push/subscribe`, `public/sw.js`.
- 완료: 푸시·SMS 발송 로깅, 실패 재시도+FAILED, SLA 경고 최소 1채널 도달.

### M7 — 관리자 콘솔
- 승인 대기열, 진행 건 모니터링(SLA 잔여·위반, **폴링**), **수동 재배정**(기존 활성배정 CANCELLED/REASSIGNED → 새 오퍼; ACCEPTED-미도착 한정 권장). 도착 임박 트럭을 살리려는 운영자 override 경로(자동 재배정 대체) 제공.
- 파일: `src/app/(admin)/dashboard`, `src/app/(admin)/requests/[id]`, `src/app/api/admin/requests/*`, `src/app/api/admin/reassign/*`.
- 완료: 대기열 승인/거절, 대시보드 SLA 잔여 실시간, 수동 재배정 경합 없음.

### M8 — 반응형 UI 마감 · PWA · e2e · 하드닝
- 3개 화면 반응형(360/768/1280px), PWA 설치/오프라인 셸, 접근성, 전체 e2e, 경합/부하 테스트, 관측성(구조 로그·SLA 메트릭).
- 완료: §5 AC 전수 통과.

---

## 5. Acceptance Criteria (테스트 가능 + 검증 방법)

| # | 기준 (측정값) | 검증 방법 |
|---|---------------|-----------|
| AC1 | 신고 생성 시 긴급도 CRITICAL/URGENT/NORMAL 선택·저장 | e2e: 각 값 제출 → `urgency` 일치 |
| AC2 | 제출 후 위치·가용성·긴급도 기준 후보 1순위를 **≤5초(p95)** 내 PROPOSED 생성 | 통합: 제출→첫 Assignment 시각차; 미승인/오프라인/BUSY/반경밖 제외 검증 |
| AC3 | 수락/거절 가능, 거절·무응답 시 다음 후보 재배정, 동일 건 활성배정 **정확히 1개**, **수락 시 기사 바인딩** | 통합: 거절→sequence+1; 타임아웃→TIMED_OUT→재배정; 동시 수락 N건→1 성공(부분 index); accept 시 technician_id 세팅 검증 |
| AC4 | SLA 측정=수락→'도착'. CRITICAL ≤60분/URGENT ≤120분 준수 판정. **NORMAL은 하드 SLA 없음(sla_targets 미생성)** | 단위: deadline_at; e2e: 도착 탭 시각 분기; NORMAL은 breach 잡 미예약 검증 |
| AC5 | '도착' 탭 시 시계 정지(measure_end·breach 잡 취소), '완료' 탭 시 COMPLETED. **'도착' 권한=바인딩 기사/업체관리자** | 통합: arrive→breach 잡 취소; complete→COMPLETED·재전이 불가; 미바인딩 기사 arrive 403 |
| AC6 | **임박 시: 관리자+고객 알림만(재배정 없음)**. **위반 시: 알림 + 자동 재배정(ACCEPTED-미도착 한정)**, 둘 다 **≤60초** 내 발송. **ARRIVED 건은 위반해도 재배정 안 함** | 통합: imminent_at 경과→알림만(새 PROPOSED 없음); deadline 경과(ACCEPTED)→알림+새 PROPOSED ≤60초; deadline 경과(ARRIVED)→no-op |
| AC7 | 셀프가입 가능, 승인 전 **활성화 불가** | e2e: PENDING 차단; 승인 후 활성 |
| AC8 | 관리자 승인/거절 | e2e: 승인→APPROVED, 거절→REJECTED |
| AC9 | 관리자 모니터링 + 수동 재배정(경합 없음) | e2e: 대시보드 표시; 수동 재배정→기존 무효+신규 1개 |
| AC10 | 고객 6-상태 **≤5초** 실시간 조회 (**폴링 3~4초 핀 기준**, worst-case <5s) | e2e: 상태 전이→폴링 주기 내 화면 갱신 시간 측정(p100 < 5s) |
| AC11 | 3개 화면 360/768/1280px 정상 | Playwright 멀티 뷰포트 |
| AC12 | 결제 기능 부재 | 라우트/코드 감사 |
| AC13 | **SLA 타이머 내구성**: 워커 전면 kill 후 재기동/스위퍼 회수 시 위반 발화 | 통합: 잡 예약→워커 kill→재기동 발화; 워커 영구다운→pg_cron 스위퍼 회수 검증 |

목표 충족: AC2/3/4/5/6/10/13 수치·메커니즘 명시, AC11 뷰포트 명시 → 측정가능 ≥90%.

---

## 6. Risks and Mitigations

| 리스크 | 영향 | 완화책 |
|--------|------|--------|
| 자동매칭 정확도/가용성 판단 | 부적합·불가용 배정 → SLA 위험 | 후보=승인+online+not-BUSY+반경 내(`ST_DWithin`); 가용성=수동 토글+활성배정 자동 BUSY; 거리·부하 랭킹; 소진 시 needs_manual; 매칭 결정 감사 로그 |
| **거리 ≠ 이동시간** [Architect #8] | 직선거리 최근접이 실제론 더 늦게 도착(도로·교통·강 등) | v1은 직선거리 근사(단순), **리스크로 명시**; `CandidateFinder` 인터페이스 뒤라 향후 라우팅/ETA API(OSRM/지도 ETA)로 교체 가능; hop 상한·SLA 버퍼로 흡수; 위반 시 재배정이 안전망 |
| SLA 타이머 신뢰성(재시작/스케줄러) | 마감 미발화 → 위반 미감지(치명) | 마감시각 DB 영속 + pg-boss delayed job(같은 DB); 워커 부트 시 자동 재개; **pg_cron 스위퍼(분리 장애도메인)** 누락 회수; idempotent 핸들러; AC13 내구성 테스트 |
| 무응답/위반 재배정 경합 | 이중 재배정 | **상태 가드 UPDATE + rowcount 분기**(idempotent); ServiceRequest `FOR UPDATE`; pg-boss SKIP LOCKED; 수락↔타임아웃 경합 시 rowcount=0 no-op |
| 동시성(같은 건 중복배정) | 한 신고 2업체 출동 | **부분 unique index**(스키마 차단) + 수락 트랜잭션 `FOR UPDATE`; 동시 수락 부하 테스트로 1건만 성공 |
| breach 후 도착 트럭 회수 | 거의 도착한 트럭 버리고 재배정 → 더 늦어짐 | **ARRIVED 재배정 금지**(가드 `WHERE status='ACCEPTED'`); ACCEPTED-미도착만 재배정; 관리자 수동 override(M7)로 임박 트럭 유지 가능 |
| 알림 전달 보장 | SLA 경고 미도달 | 다채널(푸시+SMS), 중요는 SMS 우선; 결과 로깅+재시도(백오프); iOS 웹푸시 제약→설치형 PWA 안내+SMS 폴백; 미전송 알람 |
| 셀프가입 어뷰징 | 가짜 계정 범람 | 가입 PENDING·승인 전 비활성; 휴대폰/이메일 OTP 권장; rate-limit + 중복 사업자번호/연락처 차단; 관리자 검토 체크리스트 |
| 단일 워커 SPOF [Architect #1] | 워커 죽으면 타이머/재배정 정지 | **워커 N≥2 복제본**(정합성은 DB가 보장→복제 안전) + **pg_cron 스위퍼 분리 도메인**. (대안: v1 단일 워커를 명시적 가용성 갭으로 문서화하되 스위퍼만은 out-of-process — 본 계획은 N≥2 채택) |
| PostGIS/Prisma 통합 마찰 | 지오·부분인덱스 Prisma 미지원 | 마이그레이션 raw SQL로 PostGIS/공간·부분 인덱스, 매칭은 `$queryRaw`; `CandidateFinder` 뒤로 격리; 초기 PoC 검증 |
| 워커 long-running ↔ 서버리스 | 배포 모델 불일치 | 웹+워커(N≥2) 컨테이너 + 관리형 Postgres; 순수 서버리스 비채택 명시 |

---

## 7. Verification Steps (단계별)

1. **M0**: dev·DB·pg-boss·pg_cron 활성, PWA installable.
2. **M1**: 마이그레이션; 부분 unique index 중복 활성배정 거부(Testcontainers).
3. **M2**: 단위(역할 가드)+e2e(PENDING 차단/승인 활성), 역할 교차 거부.
4. **M3**: e2e 신고 생성; **폴링 ≤5s** 상태 반영 측정.
5. **M4**: 통합(후보 필터/랭킹, 거절·타임아웃 재배정, **accept 시 기사 바인딩**), 동시 수락 부하(1건). 매칭 p95 ≤5초.
6. **M5**: 단위(deadline), 통합(arrive→breach 취소, **임박=알림만/위반=알림+재배정**, **ARRIVED no-op**), **내구성**(워커 kill→재기동 발화, 워커 다운→스위퍼 회수).
7. **M6**: 통합(푸시/SMS·재시도), SLA 경고 다채널 도달.
8. **M7**: e2e(대기열, 모니터링 SLA 잔여 실시간, 수동 재배정 경합 없음).
9. **M8**: AC1~AC13 전수 e2e(멀티 뷰포트), 경합/부하 회귀, 관측성.
- **리뷰 게이트**: 작성/실행 lane과 검증 lane 분리. 구현 후 `verifier`/`code-reviewer` 증거 기반 승인(자가 승인 금지).

---

## Business Decisions (채택된 기본값 — 승인 시 확인)

> 아래는 합의 통과를 위해 Planner가 채택한 **기본값**이다. 각 항목은 **미진전기 비즈니스 확인 시 override 가능**(pending-approval 검토 단계). 코디네이터가 relay한 "채택" 지시는 사용자 승인이 아니므로, 최종 확정은 사용자 승인 단계에서 이뤄진다. [Architect/Critic 합의 요청 반영]

| # | 정책 변수 | DECISION (기본값 — 미진전기 비즈니스 확인 필요) | 근거 |
|---|-----------|------------------------------------------------|------|
| BD1 | **NORMAL SLA (Q3)** | NORMAL은 **하드 SLA 마감 없음**(best-effort). sla_targets는 CRITICAL(60)/URGENT(120)만 생성. NORMAL은 상태머신 breach 엣지·breach 타이머에서 제외 | 일반 건에 강제 시한·재배정은 과함; 자원은 긴급 건 우선 |
| BD2 | **응답제한 시간 (Q1)** | 순차 오퍼 **hop당: 초긴급 3분 / 긴급 5분 / NORMAL 15분**, **hop 상한 3회**(초과 시 needs_manual) | §3.5 예산 수학: 초긴급 3hop=9분 소진해도 SLA 60분은 온전히 이동에 사용 |
| BD3 | **가용성 판단 (Q7)** | 업체 **online/offline 수동 토글** + 활성 배정 보유 시 **자동 BUSY**. 후보 = approved+online+not-BUSY+반경 내 | 단순·예측가능; GPS 자동감지는 비목표 |
| BD4 | **재배정-on-breach (Architect #3)** | **ARRIVED 건 재배정 금지**; ACCEPTED-미도착 위반만 재배정. 위반 시 기존 배정 **즉시 REASSIGNED(supersede)** 후 재오픈(단일 활성배정 불변식 유지). "폴백 유지(first-to-arrive-wins, 이중 배차)"는 중복배차 불변식·대면결제 혼선과 충돌 → v1 비채택, 관리자 수동 override로 보완 | 트럭 회수로 도착 지연 방지 + 스키마 불변식 일관 |
| BD5 | **기사 바인딩 (Architect #4)** | 업체가 **ACCEPT 시 소속 기사 1명 지정**→technician_id 바인딩. '도착/완료' 권한 = 바인딩 기사(또는 업체 관리자) | 자가 보고 책임 주체 명확 |
| BD6 | **실시간 전파 (Critic #5)** | **DB 폴링 3~4초 핀(≤5s) 1순위**. LISTEN/NOTIFY+SSE는 선택 강화(PgBouncer transaction-pooling 제약 주의) | 단순·풀러 호환; AC10 폴링 기준 |
| BD7 | **SLA 회계: fresh vs cumulative (Rev3 blocking)** | **기본값=fresh**: breach 재배정된 새 업체는 fresh 60/120분 윈도우(§3.8 upsert). ⇒ post-breach 누적 고객 대기는 명목 시한 초과 가능. **cumulative**(원 신고 기준 단일 시한, 재배정해도 시계 미리셋) 원하면 override — 단 cumulative는 새 업체에 비현실적 잔여시간을 줄 수 있어 운영 트레이드오프 동반 | breach 복구의 핵심 경로 정합 + 새 업체에 합리적 도착 예산 부여 |

남은 튜닝/벤더 항목(배포 전 결정, Open Questions): SLA 회계 모델 최종 확정(fresh/cumulative, BD7·OQ6), 임박 임계 %, 알림 채널 우선순위/이중화, SMS 게이트웨이 선택, 위치 입력 방식(지오코딩 vs 좌표), 알림 수신 동의 흐름.

---

## ADR (Architecture Decision Record)

- **Decision**: Next.js 풀스택 모놀리스(TS) + PostgreSQL/PostGIS + pg-boss 내구성 워커(N≥2) + pg_cron 스위퍼 + web-push/SMS 어댑터 + DB 폴링(SSE 선택).
- **Drivers**: ① SLA 타이머 내구성, ② greenfield v1 속도, ③ 실시간 + 동시성 안전.
- **Alternatives considered**: Option B(Redis/BullMQ 3-tier — 인프라·코드베이스 과다, 초고부하 시 마이그레이션 후보); Option C(Spring/Quartz JVM — 2언어·속도 최저, 엔터프라이즈 확장 시 재고).
- **Why chosen**: pg-boss가 SLA 잡을 DB와 단일 트랜잭션 경계에서 영속화(Driver 1); 단일 TS 모놀리스가 속도(Driver 2); DB 제약(부분 unique index + FOR UPDATE + 상태가드)이 정합을 보장해 워커 수평복제·폴링이 동시성/실시간(Driver 3)을 안전 충족.
- **Consequences**: 워커는 항상 켜진 별도 프로세스(N≥2) + pg_cron 스위퍼 필요(순수 서버리스 비채택). pg-boss 처리량 한계 존재(v1 충분; 초고부하 시 Redis 전환). PostGIS·부분인덱스는 raw SQL 보강. 거리≈직선근사(향후 ETA로 교체).
- **Follow-ups**: 임박 임계·채널·SMS 벤더·위치입력 확정(Open Questions), 부하 임계 도달 시 큐/오퍼모델(broadcast-to-K) 전환 기준, OTP/사업자번호 검증 도입.

---

## Changelog (Rev 2 → Rev 3: Critic 재검증 마이크로 패치)

| 이슈 | 항목 | 반영 위치 |
|------|------|-----------|
| Rev3 BLOCKING | `sla_targets` UNIQUE ↔ 재수락 충돌 해소: ACCEPT의 plain INSERT → **`ON CONFLICT(service_request_id) DO UPDATE` upsert**(measure_start/deadline/imminent 리셋, breached=false, measure_end=NULL). breach 복구 경로 정상화 | §3.8 ACCEPT |
| Rev3 BLOCKING | **Fresh SLA clock** deliberate policy 1줄 명시 + 누적 초과 가능성 명시 + **fresh vs cumulative 회계를 BD7·OQ6로 추가**(기본값 fresh) | §3.8, BD7, OQ6 |
| Rev3 Rec#1 | **hop-cap 리셋**: breach 재오픈은 fresh hop 예산(상한 3 재시작) — 즉시 needs_manual 방지 | §3.8 |
| Rev3 Rec#2 | 폴링 간격 **3~4초 핀**(worst-case <5s, AC10 엄격 충족) | §3.7, BD6, AC10 |
| Rev3 Rec#3 | DECLINE/TIMEOUT→reassign **retire(기존)→insert(새 PROPOSED) 순서** 명시 | §3.8 |

## Changelog (Rev 1 → Rev 2: 합의 리뷰 반영)

| 이슈 | 항목 | 반영 위치 |
|------|------|-----------|
| Architect #1 | 단일 워커 SPOF 제거 → 워커 N≥2 + 정합성 DB 보장 + pg_cron 스위퍼(분리 도메인) | §3.1, §3.2, §3.6, Principle 1, Risks(SPOF/타이머) |
| Architect #2 | ServiceRequest 상태머신 완성(ACCEPTED→MATCHING breach 재오픈 엣지, breached 배정→REASSIGNED) | §3.4 |
| Architect #3 | 재배정-on-breach 정책: ARRIVED 금지/ACCEPTED-미도착만, 즉시 supersede | §3.4, §3.8, BD4, AC6, Risks |
| Architect #4 | 기사 워크플로우: ACCEPT 시 technician_id 바인딩, 도착/완료 권한 | §3.3, §3.4, §3.8, M4/M5, BD5, AC3/AC5 |
| Critic #5 | 실시간: DB 폴링 1순위 확정, LISTEN/NOTIFY 선택+PgBouncer 주의, AC10 폴링 기준 | §3.1, §3.7, M3, BD6, AC10 |
| Critic #6 | 임박=알림만 / 위반=재배정 명확화, AC6 재작성 | §3.4, M5, AC6 |
| Critic #7 | 순차 단일 오퍼 명시적 결정 + SLA 예산 수학 + 부분 index 결합관계 + broadcast-to-K 노트 | §3.5 |
| Architect #8 | Principle 4 화해(`CandidateFinder` 인터페이스) + "거리≠이동시간" 리스크 행 | Principle 4, §3.2, §3.5, Risks |
| Critic #9 | 핸들러 가드(상태가드 UPDATE+rowcount), current_assignment_id 제거→파생 | §3.3, §3.8 |
| 정책 | NORMAL SLA 없음 / 응답기한 기본값 / 가용성 토글 채택·문서화 | §Business Decisions, §3.5 |

---

## Open Questions (배포 전 튜닝 — `.omc/plans/open-questions.md` 동기화)
1. SLA 임박 알림 임계값(제안: 마감 80% = 초긴급 48분/긴급 96분) — 조기 경고 타이밍.
2. 중요 알림 채널 우선순위/이중화(SLA위반 SMS 강제 + 푸시 병행 여부) — 도달률 대 비용.
3. SMS 게이트웨이 선택(Solapi/CoolSMS / NHN Cloud SENS / Naver SENS) — 단가·인증·발신번호.
4. 위치 입력 방식(주소 지오코딩 vs 좌표 직접) — 매칭 정확도(GPS 자동감지는 비목표).
5. 고객/관리자 알림 수신 동의·구독 온보딩(푸시 권한, SMS 동의).
6. **SLA 회계 모델 (BD7)**: fresh(기본값, 새 업체 재수락 시 60/120 리셋) vs cumulative(원 신고 기준 단일 시한). fresh는 post-breach 누적 대기가 명목 시한 초과 가능 — 미진전기 정책 확정 필요.

(해결: NORMAL SLA 정책·응답제한 시간·가용성 판정·SLA 회계 기본값은 §Business Decisions(BD1~BD7)에서 기본값 채택 — 승인 시 확인.)
