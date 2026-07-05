import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const rejectSchema = z.object({ reason: z.string().trim().max(200).nullish() });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const { id } = await params;
  let reason: string | null = null;
  try {
    const parsed = rejectSchema.safeParse(await req.json());
    if (parsed.success) reason = parsed.data.reason || null;
  } catch {
    // body 없이 호출 허용
  }

  const provider = await prisma.provider.findUnique({ where: { id } });
  if (!provider) {
    return NextResponse.json({ error: '업체를 찾을 수 없습니다' }, { status: 404 });
  }
  if (provider.approvalStatus !== 'PENDING') {
    return NextResponse.json(
      { error: '승인 대기 상태의 신청만 거절할 수 있습니다' },
      { status: 409 },
    );
  }

  await prisma.provider.update({
    where: { id },
    data: { approvalStatus: 'REJECTED', rejectReason: reason },
  });
  return NextResponse.json({ ok: true });
}
