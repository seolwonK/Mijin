// 구독의 상태 전이 — 입금 확인(활성화)·취소·기간 만료. 라우트가 아니라 여기에 두는 이유는
// 전이가 모두 "날짜 계산 + 조건부 갱신(CAS) + 딸린 방문 갱신" 조합이라 규칙이 흩어지면
// 어긋나기 쉬워서다. 구독과 방문을 함께 옮기는 전이는 한 트랜잭션으로 묶는다 — 중간에
// 끊기면 "구독은 취소됐는데 방문은 예정" 같은 반쪽 상태가 남는다.
import { COMPANY } from '@/lib/company';
import { prisma } from '@/lib/db';
import {
  INSPECTION_MIN_LEAD_DAYS,
  addDays,
  fromDateString,
  paymentDueDate,
  planEndDate,
  toDateString,
  todayKst,
} from '@/lib/inspection';
import type { PlanWithVisits } from '@/lib/inspectionView';

const PLAN_WITH_VISITS = {
  visits: { orderBy: { round: 'asc' } },
  payments: { orderBy: { seq: 'asc' } },
} as const;

/** 문자에 싣는 고객 포털 주소. 조사 링크(lib/survey.ts)와 같은 우선순위로 호스트를 고른다. */
export function inspectionPortalUrl(): string {
  return `${(process.env.APP_BASE_URL ?? COMPANY.siteUrl).replace(/\/$/, '')}/my`;
}

/**
 * 기간이 끝난 구독을 EXPIRED 로 내린다.
 *
 * 별도 워커를 두지 않고 구독을 읽는 화면들이 호출한다 — 만료는 "그 구독을 볼 때"만
 * 의미가 있고, 조건부 갱신이라 여러 번 호출해도 결과가 같다(멱등). 크론을 하나 더
 * 만들어 운영 부담을 늘리는 대신 읽기 경로에 얹는 쪽을 택했다.
 *
 * 고객 경로는 userId 로 범위를 좁힌다 — 고객 한 명의 30초 폴링이 전체 구독 테이블을
 * 훑을 이유가 없다. 관리자 경로만 전체를 내린다.
 */
export async function expireDuePlans(
  scope: { userId?: string } = {},
  now: Date = new Date(),
): Promise<number> {
  const today = fromDateString(todayKst(now));
  const result = await prisma.inspectionPlan.updateMany({
    where: { status: 'ACTIVE', endDate: { lt: today }, userId: scope.userId },
    data: { status: 'EXPIRED' },
  });
  return result.count;
}

type SettleFailure = { ok: false; reason: 'NOT_FOUND' | 'ALREADY_SETTLED' };

export type ActivateResult =
  | { ok: true; plan: PlanWithVisits; firstVisitDate: string | null }
  | SettleFailure;

/**
 * 입금 확인 → 구독 활성화. **확인한 날이 구독 시작일**이고, 기간은 신청한 요금제(termMonths)를 따른다.
 *
 * 1회차 점검은 입금 전에 이미 희망일을 받아 둔 상태(REQUESTED)다. 확인이 늦어져 그 날짜가
 * 지났거나 **방문 준비 시간(리드타임)이 남지 않았으면 확정하지 않고 REQUESTED 로 남긴다** —
 * 고객 화면이 needsReschedule 로 읽어 다시 고르게 한다. 조용히 다른 날로 옮기지 않는 것이
 * 요점이다. 리드타임을 여기서도 지키는 이유: 확인한 그날이 희망일이면 "오늘 방문"이 아무
 * 준비 없이 확정되고, 고객은 그 문자를 받고 기다린다.
 */
export async function activatePlan(
  planId: string,
  adminUserId: string,
  now: Date = new Date(),
): Promise<ActivateResult> {
  const today = todayKst(now);

  return prisma.$transaction(async (tx): Promise<ActivateResult> => {
    const pending = await tx.inspectionPlan.findUnique({
      where: { id: planId },
      select: { termMonths: true, monthlyWon: true },
    });
    if (!pending) return { ok: false, reason: 'NOT_FOUND' };
    const endDate = planEndDate(today, pending.termMonths);

    // CAS — PENDING_PAYMENT 인 동안 정확히 한 번만 성공한다(더블 클릭·재전송 방어).
    const claimed = await tx.inspectionPlan.updateMany({
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
      const exists = await tx.inspectionPlan.findUnique({
        where: { id: planId },
        select: { id: true },
      });
      return { ok: false, reason: exists ? 'ALREADY_SETTLED' : 'NOT_FOUND' };
    }

    // 매월 자동이체 구독이면 약정 기간 전체의 납부 일정을 만든다. 지금 확인한 입금이 첫 달이다.
    if (pending.monthlyWon != null) {
      await tx.inspectionPayment.createMany({
        data: Array.from({ length: pending.termMonths }, (_, i) => ({
          planId,
          seq: i + 1,
          dueDate: fromDateString(paymentDueDate(today, i + 1)),
          amountWon: pending.monthlyWon!,
          ...(i === 0 ? { paidAt: now, confirmedByUserId: adminUserId } : {}),
        })),
      });
    }

    // 1회차 희망일이 아직 유효하면 점검 예정으로 확정한다.
    const firstVisit = await tx.inspectionVisit.findUnique({
      where: { planId_round: { planId, round: 1 } },
    });
    let firstVisitDate: string | null = null;
    if (firstVisit && firstVisit.status === 'REQUESTED') {
      const date = toDateString(firstVisit.preferredDate);
      // 기간의 시작일이 곧 오늘이므로 하한은 리드타임 하나로 충분하다.
      if (date >= addDays(today, INSPECTION_MIN_LEAD_DAYS) && date <= endDate) {
        await tx.inspectionVisit.update({
          where: { id: firstVisit.id },
          data: { status: 'SCHEDULED' },
        });
        firstVisitDate = date;
      }
    }

    const plan = await tx.inspectionPlan.findUniqueOrThrow({
      where: { id: planId },
      include: PLAN_WITH_VISITS,
    });
    return { ok: true, plan, firstVisitDate };
  });
}

export type CancelResult = { ok: true; plan: PlanWithVisits } | SettleFailure;

/**
 * 구독 취소 — 오입금·환불·고객 요청. 예정된 방문도 함께 취소한다: 구독이 없는데 방문만
 * 일정표에 남으면 기사가 헛걸음한다.
 */
export async function cancelPlan(
  planId: string,
  reason: string,
  now: Date = new Date(),
): Promise<CancelResult> {
  return prisma.$transaction(async (tx): Promise<CancelResult> => {
    // CAS — 이미 취소·만료된 구독은 건드리지 않는다.
    const claimed = await tx.inspectionPlan.updateMany({
      where: { id: planId, status: { in: ['PENDING_PAYMENT', 'ACTIVE'] } },
      data: { status: 'CANCELED', canceledAt: now, cancelReason: reason },
    });
    if (claimed.count === 0) {
      const exists = await tx.inspectionPlan.findUnique({
        where: { id: planId },
        select: { id: true },
      });
      return { ok: false, reason: exists ? 'ALREADY_SETTLED' : 'NOT_FOUND' };
    }

    await tx.inspectionVisit.updateMany({
      where: { planId, status: { in: ['REQUESTED', 'SCHEDULED'] } },
      data: { status: 'CANCELED', canceledAt: now },
    });

    const plan = await tx.inspectionPlan.findUniqueOrThrow({
      where: { id: planId },
      include: PLAN_WITH_VISITS,
    });
    return { ok: true, plan };
  });
}

export { PLAN_WITH_VISITS };
