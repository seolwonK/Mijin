import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { sendSms } from '@/lib/sms';
import { smsAssignmentRecalled } from '@/lib/sms/templates';

// 응답 대기(REQUESTED) 중인 배정을 회수하고 접수를 배정 대기로 되돌린다.
// 업체 수락/거절과의 경합은 assignment 상태 CAS 로 해소된다 (한쪽만 성공).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const { id } = await params;
  const pending = await prisma.assignment.findFirst({
    where: { requestId: id, status: 'REQUESTED' },
    orderBy: { createdAt: 'desc' },
    include: { provider: { include: { user: { select: { phone: true } } } } },
  });
  if (!pending) {
    return NextResponse.json(
      { error: '회수할 응답 대기 배정이 없습니다 (업체가 이미 응답했을 수 있습니다)' },
      { status: 409 },
    );
  }

  const claimed = await prisma.assignment.updateMany({
    where: { id: pending.id, status: 'REQUESTED' },
    data: { status: 'CANCELED', respondedAt: new Date() },
  });
  if (claimed.count === 0) {
    return NextResponse.json(
      { error: '업체가 방금 응답하여 회수할 수 없습니다' },
      { status: 409 },
    );
  }

  // 배정 대기로 복귀 + 자동배정 타이머 리셋 (자동 모드면 대기시간 후 재배정 시도)
  await prisma.serviceRequest.updateMany({
    where: { id, status: 'ASSIGNED' },
    data: { status: 'RECEIVED', assignBaseAt: new Date() },
  });

  // 회수 안내 문자 — 업체가 배정 문자만 보고 출동하는 일을 방지 (실패해도 회수는 유지)
  void sendSms(pending.provider.user.phone, smsAssignmentRecalled(), id);

  return NextResponse.json({ ok: true });
}
