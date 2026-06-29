# Deep Interview Spec: 미진전기 긴급 출동 디스패치 플랫폼

## Metadata
- Interview ID: mijin-dispatch-2026-06-28
- Rounds: 8 (+ Round 0 topology gate)
- Final Ambiguity Score: 17.5%
- Type: greenfield
- Generated: 2026-06-28
- Threshold: 0.2
- Threshold Source: default
- Initial Context Summarized: no
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.90 | 0.40 | 0.360 |
| Constraint Clarity | 0.85 | 0.30 | 0.255 |
| Success Criteria | 0.70 | 0.30 | 0.210 |
| **Total Clarity** | | | **0.825** |
| **Ambiguity** | | | **0.175** |

## Topology
Round 0에서 확정한 4개 최상위 컴포넌트. 4개 모두 활성, 비목표 결제 연동은 명시적으로 제외.

| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| 고객(전기업체) 신고·조회 | active | 고객이 고장을 신고(긴급도 직접 선택)하고 진행상황을 실시간 조회하는 모바일 웹 | AC: 신고 생성, 긴급도 선택, 상태 조회 |
| 출동업체/기사 처리 | active | 외부 등록 출동업체가 자동매칭된 건을 수락/거절하고, 기사가 도착·완료를 처리 | AC: 매칭 수락/거절, 기사 도착/완료 버튼 |
| 관리자(미진) 운영 콘솔 | active | 계정 승인, 신고/SLA 모니터링, 수동 재배정 | AC: 승인 대기열, 모니터링, 수동 개입 |
| 고객선택 긴급도 + SLA(1h/2h) 타이머·추적 | active | 고객이 선택한 긴급도에 따라 도착 시한을 추적하고 위반 시 알림·재배정 트리거 | AC: SLA 측정(수락→도착), 위반 시 알림+재배정 |

## Goal
전기업체(고객)가 전기 고장을 신고하면서 **긴급도(초긴급/긴급/일반)를 직접 선택**하면, 시스템이 **위치·가용성 기준으로 외부 등록 출동업체를 자동 매칭**하고(거절·무응답 시 다음 업체로 자동 재배정), 출동 기사가 현장에서 **'도착'·'완료'를 탭**해 처리하는 3자 마켓플레이스형 긴급 출동 디스패치 플랫폼. 미진전기는 플랫폼 **최고 관리자**로서 계정 승인·SLA 모니터링·수동 개입을 수행한다. 핵심 약속은 **초긴급 1시간 / 긴급 2시간 내 도착**이며, 모든 화면을 **모바일 우선 반응형 웹** 단일 코드베이스로 제공한다.

## Constraints
- 모바일 웹 1순위 — 3개 화면(고객/기사/관리자) 모두 단일 반응형 웹으로 폰/태블릿/PC 대응
- SLA 측정 기준: 업체 수락 시각 → 기사 '도착' 탭 시각. 초긴급 ≤ 60분, 긴급 ≤ 120분
- 출동업체는 외부 등록 업체 **다수** (마켓플레이스). 출시 초기부터 업체 수가 충분히 많아 자동매칭이 v1 필수
- 배정 방식: 자동 매칭(위치·가용성·긴급도). 업체 수락/거절 가능, 거절·무응답(제한시간 초과) 시 자동 재배정
- SLA 위반(또는 임박) 시: 관리자·고객 알림(푸시/문자) + 자동 재배정
- 계정 온보딩: 출동업체·고객 모두 셀프 가입 → 관리자 승인 후 활성화
- 알림 채널 필요(SLA 경고·상태변경·매칭 통지): 웹 푸시/PWA 및/또는 SMS

## Non-Goals
- **시스템 결제 연동 없음** — 결제는 출동업체 ↔ 고객 대면 거래 (플랫폼은 결제 중개 안 함)
- 업체 페널티/평점 시스템 (v1 미포함 — SLA 위반 시 처리에서 선택되지 않음)
- 네이티브 모바일 앱 (반응형 모바일 웹으로 대체; 추후 단계)
- GPS 기반 도착 자동 감지 (기사 버튼 자가 보고로 대체)

## Acceptance Criteria
- [ ] 고객이 신고 시 초긴급/긴급/일반 중 긴급도를 직접 선택할 수 있다
- [ ] 신고 접수 시 시스템이 위치·가용성·긴급도 기준으로 적합한 출동업체를 자동 선정한다
- [ ] 매칭된 업체가 수락/거절할 수 있고, 거절 또는 제한시간 내 무응답 시 다음 적합 업체로 자동 재배정된다
- [ ] 초긴급 신고는 수락→기사 '도착' 탭까지 60분, 긴급은 120분 이내가 SLA 준수로 측정된다
- [ ] 기사가 '도착'을 탭하면 SLA 시계가 멈추고, '완료'를 탭하면 해당 건이 종료된다
- [ ] SLA 위반(또는 임박) 시 관리자와 고객에게 알림이 발송되고 자동 재배정이 트리거된다
- [ ] 출동업체·고객이 셀프 가입할 수 있고, 관리자 승인 전에는 계정이 활성화되지 않는다
- [ ] 관리자가 승인 대기 계정을 승인/거절할 수 있다
- [ ] 관리자가 진행 중인 건을 모니터링하고 필요 시 수동으로 재배정할 수 있다
- [ ] 고객이 자신의 신고 상태(접수/매칭중/수락/출동중/도착/완료)를 실시간으로 조회할 수 있다
- [ ] 모든 화면이 모바일 우선 반응형 웹으로 폰/태블릿/PC에서 정상 동작한다
- [ ] 시스템에 결제 기능이 포함되지 않는다(대면 결제)

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 긴급도를 시스템/관리자가 분류 | Round 0 토폴로지 게이트 | 고객이 신고 시 직접 선택 |
| 출동업체가 미진 내부 기사일 수 있음 | Round 1 행위자 구조 | 외부 등록 업체 다수 — 3자 마켓플레이스 |
| 신고→업체 연결 방식 불명 | Round 2 배정 메커니즘 | 자동 매칭(위치·가용) |
| 매칭 후 강제 배정 가능성 | Round 3 수락/재배정 | 수락/거절 + 무응답 시 자동 재배정(SLA 보호) |
| 자동매칭이 과한 복잡도일 수 있음 | Round 4 Contrarian | 업체 多 → 자동매칭 v1 필수(의도된 선택) |
| SLA 미준수 시 동작 불명 | Round 5 제약 | 관리자·고객 알림 + 자동 재배정 (페널티는 비목표) |
| 셀프가입을 초대제로 단순화 | Round 6 Simplifier | 셀프가입 + 관리자 승인 유지(의도된 선택) |
| 도착/완료 측정 방식 불명 | Round 7 SLA 측정점 | 기사 앱 버튼 자가 보고 |
| 관리자 콘솔은 데스크톱 | Round 8 플랫폼 범위 | 3개 화면 모두 반응형 모바일웹 |

## Technical Context
- **Greenfield**: 빈 프로젝트(IntelliJ 스텁 `mijin.iml`, `.idea/`만 존재). 기술 스택 미정.
- 권장 방향(계획 단계 확정 대상): 모바일 우선 반응형 웹 SPA(프론트) + API 백엔드 + RDB + 알림 연동(웹 푸시/PWA 또는 SMS 게이트웨이). 지오 매칭을 위해 위치(좌표/주소) 저장 및 거리/가용성 기반 매칭 로직 필요.
- 역할 기반 인증(고객/출동업체/기사/관리자) + 승인 상태(pending/approved) 모델 필요.
- 결제 모듈 없음.

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| 고객(Customer/전기업체) | core domain | id, 상호, 연락처, 위치/주소, 승인상태 | Customer has many ServiceRequest |
| 출동업체(DispatchCompany) | core domain | id, 상호, 서비스지역, 가용상태, 승인상태, 연락처 | DispatchCompany has many Technician, receives Assignment |
| 신고건(ServiceRequest) | core domain | id, 긴급도(초긴급/긴급/일반), 고장유형, 위치, 상태, 신고시각, 도착기한, 도착시각, 완료시각 | belongs to Customer, has many Assignment, has one SLATarget |
| 배정(Assignment) | core domain | id, 상태(제안/수락/거절/무응답/재배정), 제안시각, 응답시각 | links ServiceRequest ↔ DispatchCompany/Technician |
| 기사(Technician) | supporting | id, 연락처 | belongs to DispatchCompany, executes Assignment |
| 관리자(Admin) | supporting | id, 권한 | approves Customer/DispatchCompany, oversees ServiceRequest |
| 도착시한(SLATarget) | supporting | 긴급도별 시한(1h/2h), 측정 시작/종료점 | belongs to ServiceRequest |
| 알림(Notification) | supporting | id, 수신자, 유형(SLA위반/상태변경/매칭), 채널(푸시/SMS), 시각 | sent to Customer/DispatchCompany/Admin |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 5 | 5 | - | - | N/A |
| 2 | 6 | 1 (ServiceArea) | 0 | 5 | 83% |
| 3 | 7 | 1 (Assignment) | 0 | 6 | 86% |
| 4 | 7 | 0 | 0 | 7 | 100% |
| 5 | 8 | 1 (Notification) | 0 | 7 | 88% |
| 6 | 8 | 0 | 0 | 8 | 100% |
| 7 | 8 | 0 | 0 | 8 | 100% |
| 8 | 8 | 0 | 0 | 8 | 100% |

(ServiceArea는 DispatchCompany.서비스지역 필드로 흡수되어 최종 표에서는 통합. 핵심 엔티티 8개로 수렴.)

## Interview Transcript
<details>
<summary>Full Q&A (Round 0 + 8 rounds)</summary>

### Round 0 — Topology Confirmation
**Q:** 4개 최상위 구성요소(고객 신고/조회, 출동업체 처리, 관리자 콘솔, 분류·SLA 엔진)가 맞나요?
**A:** "긴급 초긴급 일반은 고객이 직접 설정하는거야" → 4번 컴포넌트를 '고객선택 긴급도 + SLA 타이머'로 재정의, 토폴로지 4개 확정.

### Round 1 — 행위자 구조
**Q:** '출동업체'는 누구인가요?
**A:** 외부 등록 업체 다수 (3자 마켓플레이스).
**Ambiguity:** 65% (Goal 0.50, Constraints 0.30, Criteria 0.20)

### Round 2 — 배정 메커니즘
**Q:** 신고건이 출동업체에게 어떻게 도달하나요?
**A:** 자동 매칭(지역/가용).
**Ambiguity:** 56% (Goal 0.65, Constraints 0.35, Criteria 0.25)

### Round 3 — 수락/재배정
**Q:** 매칭된 후 출동 확정까지 흐름은? (무응답 시 SLA 보호)
**A:** 수락/거절 + 자동 재배정.
**Ambiguity:** 47% (Goal 0.82, Constraints 0.38, Criteria 0.30)

### Round 4 — Contrarian (MVP 범위)
**Q:** 출시 초기 규모와 자동매칭 v1 필요성은?
**A:** 업체 많음, 자동매칭 필수.
**Ambiguity:** 43% (Goal 0.83, Constraints 0.45, Criteria 0.32)

### Round 5 — SLA 미준수
**Q:** SLA(1h/2h) 미준수 시 시스템 동작? (복수)
**A:** 관리자·고객 알림 + 자동 재배정. (페널티/평점 미선택)
**Ambiguity:** 37% (Goal 0.85, Constraints 0.58, Criteria 0.40)

### Round 6 — Simplifier (온보딩)
**Q:** v1 계정 가입/온보딩 모델은?
**A:** 셀프가입 + 관리자 승인.
**Ambiguity:** 32% (Goal 0.85, Constraints 0.68, Criteria 0.45)

### Round 7 — 도착/완료 측정
**Q:** 도착·완료를 시스템이 어떻게 확인? (SLA 시계 정지 기준)
**A:** 기사가 앱에서 버튼.
**Ambiguity:** 24% (Goal 0.90, Constraints 0.70, Criteria 0.62)

### Round 8 — 플랫폼 범위
**Q:** 3개 화면의 플랫폼 범위는?
**A:** 3개 모두 반응형 모바일웹.
**Ambiguity:** 17.5% (Goal 0.90, Constraints 0.85, Criteria 0.70) — PASSED ✅

</details>
```

## Status: pending approval
