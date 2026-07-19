import { PrismaClient } from '@prisma/client';

// admin-queue.spec.ts 픽스처(900011)를 결정론적 상태로 복원한다.
// dev 서버의 자동배정 워커(instrumentation, waitMinutesUrgent 기본 20분)가
// RECEIVED 픽스처를 주기적으로 실제 배정해 버리므로, 스위트 시작 전에
// 활성 배정을 CANCELED로 보존하고 상태·타이머를 리셋한다(이력 삭제 없음).
const QUEUE_FIXTURE_CODE = '900011';

export default async function globalSetup() {
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
