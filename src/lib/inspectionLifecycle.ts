// 구독의 상태 전이 — 입금 확인(활성화)과 기간 만료. 라우트가 아니라 여기에 두는 이유는
// 두 전이 모두 "날짜 계산 + 조건부 갱신(CAS)" 조합이라 규칙이 흩어지면 어긋나기 쉬워서다.
import { prisma } from '@/lib/db';
import {
  type Quarter,
  fromDateString,
  planEndDate,
  quarterWindow,
  toDateString,
  todayKst,
} from '@/lib/inspection';
import type { PlanWithVisits } from '@/lib/inspectionView';

const PLAN_WITH_VISITS = {
  visits: { orderBy: { quarter: 'asc' } },
} as const;

/**
 * 기간이 끝난 구독을 EXPIRED 로 내린다.
 *
 * 별도 워커를 두지 않고 구독을 읽는 화면들이 호출한다 — 만료는 "그 구독을 볼 때"만
 * 의미가 있고, 조건부 갱신이라 여러 번 호출해도 결과가 같다(멱등). 크론을 하나 더
 * 만들어 운영 부담을 늘리는 대신 읽기 경로에 얹는 쪽을 택했다.
 */
export async function expireDuePlans(now: Date = new Date()): Promise<number> {
  const today = fromDateString(todayKst(now));
  const result = await prisma.inspectionPlan.updateMany({
    where: { status: 'ACTIVE', endDate: { lt: today } },
    data: { status: 'EXPIRED' },
  });
  return result.count;
}

export type ActivateResult =
  | { ok: true; plan: PlanWithVisits; firstVisitDate: string | null }
  | { ok: false; reason: 'NOT_FOUND' | 'ALREADY_SETTLED' };

/**
 * 입금 확인 → 구독 활성화. **확인한 날이 구독 시작일**이다(사용자 결정: 가입일 기준 4구간).
 *
 * 1분기 방문은 입금 전에 이미 희망일을 받아 둔 상태(REQUESTED)다. 확인이 늦어져 그 날짜가
 * 지났거나 1분기 창 밖으로 밀렸으면 **확정하지 않고 REQUESTED 로 남긴다** — 고객 화면이
 * needsReschedule 로 읽어 다시 고르게 한다. 조용히 다른 날로 옮기지 않는 것이 요점이다.
 */
export async function activatePlan(
  planId: string,
  adminUserId: string,
  now: Date = new Date(),
): Promise<ActivateResult> {
  const today = todayKst(now);
  const endDate = planEndDate(today);

  // CAS — PENDING_PAYMENT 인 동안 정확히 한 번만 성공한다(더블 클릭·재전송 방어).
  const claimed = await prisma.inspectionPlan.updateMany({
    where: { id: planId, status: 'PENDING_PAYMENT' },
    data: {
      status: 'ACTIVE',
      startDate: fromDateString(today),
      endDate: fromDateString(endDate),
      paidConfirmedAt: now,
      paidConfirmedByUserId: adminUserId,
    },
  });
  if (claimed.count === 0) {
    const exists = await prisma.inspectionPlan.findUnique({
      where: { id: planId },
      select: { id: true },
    });
    return { ok: false, reason: exists ? 'ALREADY_SETTLED' : 'NOT_FOUND' };
  }

  // 1분기 희망일이 아직 유효하면 방문 예정으로 확정한다.
  const firstQuarter: Quarter = 1;
  const window = quarterWindow(today, firstQuarter);
  const firstVisit = await prisma.inspectionVisit.findUnique({
    where: { planId_quarter: { planId, quarter: firstQuarter } },
  });
  let firstVisitDate: string | null = null;
  if (firstVisit && firstVisit.status === 'REQUESTED') {
    const date = toDateString(firstVisit.preferredDate);
    if (date >= today && date >= window.start && date < window.endExclusive) {
      await prisma.inspectionVisit.update({
        where: { id: firstVisit.id },
        data: { status: 'SCHEDULED' },
      });
      firstVisitDate = date;
    }
  }

  const plan = await prisma.inspectionPlan.findUniqueOrThrow({
    where: { id: planId },
    include: PLAN_WITH_VISITS,
  });
  return { ok: true, plan, firstVisitDate };
}

export { PLAN_WITH_VISITS };
