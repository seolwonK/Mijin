// 무응답 자동 회수 응답 제한시간(분) — 단일 진실 원천.
//
// 제한시간이 지나면 워커가 배정을 회수하고 즉시 다음 순위에게 재배정한다
// ("접수 즉시 배정 + 무응답 10분 순차 재배정" 운영 결정, 2026-08-31).
// 설정 화면 항목이 아닌 코드 상수라 변경하려면 배포가 필요하다 — 배정로직 상세 문서 12장 참조.
//
// 이 파일은 서버 모듈(prisma 등)을 import 하지 않는다. 포털의 경과 배너
// (components/ResponseDeadlineNote.tsx)가 클라이언트에서 같은 값을 읽어야 하기 때문이다.
// 값을 여기서만 고치면 워커와 화면이 함께 움직인다.
export const RESPONSE_TIMEOUT_MINUTES = {
  CRITICAL: 10,
  URGENT: 10,
  NORMAL: 10,
} as const;
