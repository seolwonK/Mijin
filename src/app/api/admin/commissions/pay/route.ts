import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';

// 건별 선택 지급 또는 소개자 단위 전액 지급 — 둘 중 하나만 받는다.
const paySchema = z.union([
  z.object({ entryIds: z.array(z.string()).min(1) }),
  z.object({ referrerUserId: z.string().min(1) }),
]);

// PENDING → PAID 일괄 처리(CAS 동형 updateMany). 이미 지급된 건은 where 조건에 걸리지 않아
// 재요청해도 count가 늘지 않는다(멱등).
export async function POST(req: NextRequest) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }
  const parsed = paySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다' }, { status: 400 });
  }
  const data = parsed.data;

  const result = await prisma.commissionEntry.updateMany({
    where: {
      status: 'PENDING',
      ...('entryIds' in data ? { id: { in: data.entryIds } } : { referrerUserId: data.referrerUserId }),
    },
    data: { status: 'PAID', paidAt: new Date() },
  });

  return NextResponse.json({ paid: result.count });
}
