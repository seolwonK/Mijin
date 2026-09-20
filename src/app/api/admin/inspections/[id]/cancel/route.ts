import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { PLAN_WITH_VISITS } from '@/lib/inspectionLifecycle';
import { buildPlanView } from '@/lib/inspectionView';

// 구독 취소 — 오입금·환불·고객 요청. 사유는 필수다(나중에 "왜 취소했더라"가 남지 않게).
// 예정된 방문도 함께 취소한다: 구독이 없는데 방문만 일정표에 남으면 기사가 헛걸음한다.

const cancelSchema = z.object({
  reason: z
    .string({ error: '취소 사유를 입력해 주세요' })
    .trim()
    .min(1, '취소 사유를 입력해 주세요')
    .max(200, '취소 사유는 200자 이내로 입력해 주세요'),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireSession('ADMIN'))) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }
  const parsed = cancelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요' },
      { status: 400 },
    );
  }

  const now = new Date();
  // CAS — 이미 취소·만료된 구독은 건드리지 않는다.
  const claimed = await prisma.inspectionPlan.updateMany({
    where: { id, status: { in: ['PENDING_PAYMENT', 'ACTIVE'] } },
    data: { status: 'CANCELED', canceledAt: now, cancelReason: parsed.data.reason },
  });
  if (claimed.count === 0) {
    const exists = await prisma.inspectionPlan.findUnique({
      where: { id },
      select: { id: true },
    });
    return exists
      ? NextResponse.json(
          { error: '이미 종료된 구독입니다. 화면을 새로고침해 주세요.' },
          { status: 409 },
        )
      : NextResponse.json({ error: '구독을 찾을 수 없습니다' }, { status: 404 });
  }

  await prisma.inspectionVisit.updateMany({
    where: { planId: id, status: { in: ['REQUESTED', 'SCHEDULED'] } },
    data: { status: 'CANCELED', canceledAt: now },
  });

  const plan = await prisma.inspectionPlan.findUniqueOrThrow({
    where: { id },
    include: PLAN_WITH_VISITS,
  });
  return NextResponse.json({ ok: true, plan: buildPlanView(plan) });
}
