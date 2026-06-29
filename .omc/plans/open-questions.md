# Open Questions

## mijin-dispatch-plan - 2026-06-28 (Rev 2, 합의 리뷰 반영)

### 해결됨 (Business Decisions 기본값 채택 — 사용자 승인 시 확인/override 가능)
- [x] 업체 응답제한 시간 → BD2: hop당 초긴급 3분 / 긴급 5분 / NORMAL 15분, hop 상한 3회 (SLA 예산 수학으로 정당화)
- [x] NORMAL(일반) SLA 정책 → BD1: 하드 SLA 마감 없음(best-effort), sla_targets 미생성, breach 범위 제외
- [x] 가용성 판정 기준 → BD3: online/offline 수동 토글 + 활성 배정 보유 시 자동 BUSY
- [x] 재배정-on-breach 정책 → BD4: ARRIVED 재배정 금지, ACCEPTED-미도착만 즉시 supersede 후 재오픈
- [x] 기사 바인딩/권한 → BD5: ACCEPT 시 소속 기사 1명 지정, 도착/완료 권한=바인딩 기사/업체관리자
- [x] 실시간 전파 메커니즘 → BD6: DB 폴링 ≤5s 1순위 (LISTEN/NOTIFY는 선택 강화)

### 남은 항목 (배포 전 튜닝 — 비즈니스/벤더 확인 대기)
- [ ] **SLA 회계 모델 (BD7)**: fresh(기본값 — breach 재배정 시 새 업체 60/120 리셋) vs cumulative(원 신고 기준 단일 시한) — fresh는 post-breach 누적 대기가 명목 시한 초과 가능, 미진전기 정책 확정 필요
- [ ] SLA 임박 알림 임계값 (제안: 마감 80% = 초긴급 48분 / 긴급 96분) — 조기 경고 타이밍
- [ ] 중요 알림 채널 우선순위/이중화 (SLA 위반 시 SMS 강제 + 푸시 병행 여부) — 도달률 대 비용
- [ ] SMS 게이트웨이 선택 (Solapi/CoolSMS vs NHN Cloud SENS vs Naver SENS) — 단가·인증·발신번호 사전등록
- [ ] 위치 입력 방식 (주소 지오코딩 API vs 좌표 직접 입력) — 매칭 정확도 (GPS 자동감지는 비목표)
- [ ] 고객/관리자 알림 수신 동의·구독 온보딩 흐름 (푸시 권한, SMS 수신 동의)
- [ ] (확장 트리거) 부하 임계 도달 시 큐(pg-boss→Redis) 및 오퍼 모델(순차→broadcast-to-K) 전환 기준
