import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const { id } = await params;
  const updated = await prisma.serviceRequest.updateMany({
    where: { id, status: { in: ['RECEIVED', 'ASSIGNED', 'ACCEPTED', 'DISPATCHED'] } },
    data: { status: 'CANCELED', needsAttention: false },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: '취소할 수 없는 상태입니다' }, { status: 409 });
  }
  await prisma.assignment.updateMany({
    where: { requestId: id, status: { in: ['REQUESTED', 'ACCEPTED'] } },
    data: { status: 'CANCELED', respondedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
