import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { spendEggOnAccept } from '@/lib/eggs';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession('PROVIDER');
  if (!session?.providerId) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }

  const { id } = await params;
  const a = await prisma.assignment.findUnique({
    where: { id },
    include: { request: true },
  });
  if (!a || a.providerId !== session.providerId) {
    return NextResponse.json({ error: '배정 건을 찾을 수 없습니다' }, { status: 404 });
  }

  // CAS: 이미 거절/취소된 배정의 수락 방지
  const claimed = await prisma.assignment.updateMany({
    where: { id, status: 'REQUESTED' },
    data: { status: 'ACCEPTED', respondedAt: new Date() },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: '이미 처리된 배정입니다' }, { status: 409 });
  }
  await prisma.serviceRequest.updateMany({
    where: { id: a.requestId, status: 'ASSIGNED' },
    data: { status: 'ACCEPTED' },
  });
  // 알 차감(잔액≥1이면 -1, 멱등) — 실패는 응답에 전파하지 않는다: 이미 수락된 건이
  // 트랜지언트 오류로 500→재시도 409를 받는 모순 방지. 복구는 로그+무결성 스크립트 (iii).
  await spendEggOnAccept({ kind: 'PROVIDER', id: session.providerId }, id).catch((e) =>
    console.error('[eggs] spend failed after accept', id, e),
  );
  return NextResponse.json({ ok: true });
}
