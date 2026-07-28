import { PrismaClient } from '@prisma/client';
import { initRunNonce } from './helpers/ip';

// admin-queue.spec.ts 픽스처(900011)를 결정론적 상태로 복원한다.
// dev 서버의 자동배정 워커(instrumentation, waitMinutesUrgent 기본 20분)가
// RECEIVED 픽스처를 주기적으로 실제 배정해 버리므로, 스위트 시작 전에
// 활성 배정을 CANCELED로 보존하고 상태·타이머를 리셋한다(이력 삭제 없음).
//
// 9001 대역 일회성 잔재 스윕은 여기 있지 않다 — tests/pretest-guard.ts 로 옮겼다.
// globalSetup 은 dev 서버가 **이미 뜬 뒤**에 돌기 때문에(playwright
// runner/index.js:5852-5858) 여기서 지우면 자동배정 워커와 경쟁한다.
const QUEUE_FIXTURE_CODE = '900011';

export default async function globalSetup() {
  // 실행 단위 nonce — 워커는 fork 시점의 process.env 를 상속한다(runner/index.js:1853-1861).
  // 레이트리밋 버킷이 실행 간에 재사용되지 않도록 하는 유일한 장치이므로 로그에 남긴다.
  console.log(`[global-setup] E2E_RUN_NONCE=${initRunNonce()} (재현: E2E_RUN_NONCE=<값> 로 실행)`);

  const prisma = new PrismaClient();
  try {
    const request = await prisma.serviceRequest.findUnique({
      where: { lookupCode: QUEUE_FIXTURE_CODE },
    });
    if (!request) return; // 픽스처 없는 환경(빈 DB)에서는 조용히 통과 — 해당 스펙이 자체 실패로 알린다.
    await prisma.assignment.updateMany({
      where: { requestId: request.id, status: { in: ['REQUESTED', 'ACCEPTED'] } },
      data: { status: 'CANCELED' },
    });
    await prisma.serviceRequest.update({
      where: { id: request.id },
      data: { status: 'RECEIVED', needsAttention: false, completedAt: null, assignBaseAt: new Date() },
    });
  } finally {
    await prisma.$disconnect();
  }
}
