import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession('TECHNICIAN');
  if (!session?.technicianId) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }

  const { id } = await params;
  const a = await prisma.assignment.findUnique({
    where: { id },
    include: { request: true },
  });
  if (!a || a.technicianId !== session.technicianId) {
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
  return NextResponse.json({ ok: true });
}
