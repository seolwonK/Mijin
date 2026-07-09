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
  const technician = await prisma.technician.findUnique({ where: { id } });
  if (!technician) {
    return NextResponse.json({ error: '기술자를 찾을 수 없습니다' }, { status: 404 });
  }
  if (technician.approvalStatus === 'APPROVED') {
    return NextResponse.json({ error: '이미 승인된 기술자입니다' }, { status: 409 });
  }

  await prisma.technician.update({
    where: { id },
    data: { approvalStatus: 'APPROVED', approvedAt: new Date(), rejectReason: null },
  });
  return NextResponse.json({ ok: true });
}
