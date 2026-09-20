import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { INSPECTION_PRICE_WON } from '@/lib/inspection';
import { readInspectionAccount } from '@/lib/inspectionAccount';
import { expireDuePlans, PLAN_WITH_VISITS } from '@/lib/inspectionLifecycle';
import { buildPlanView } from '@/lib/inspectionView';

// 내 점검 구독 현황 — 마이페이지가 폴링한다.
// 가장 최근 구독 1건만 내려간다(갱신하면 새 행이 생기므로 createdAt 내림차순 첫 건).
export async function GET() {
  const session = await requireSession('CUSTOMER');
  if (!session) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }

  // 기간이 끝난 구독을 먼저 내린다 — 만료를 크론이 아니라 읽기 경로가 맡는다(inspectionLifecycle).
  await expireDuePlans();

  const plan = await prisma.inspectionPlan.findFirst({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
    include: PLAN_WITH_VISITS,
  });
  const account = await readInspectionAccount();

  return NextResponse.json(
    {
      name: session.name,
      priceWon: INSPECTION_PRICE_WON,
      account,
      plan: plan ? buildPlanView(plan) : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
