import { NextRequest, NextResponse } from 'next/server';
import type { InspectionVisit, Prisma } from '@prisma/client';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { addDays, daysBetween, fromDateString, toDateString, todayKst } from '@/lib/inspection';
import { expireDuePlans } from '@/lib/inspectionLifecycle';
import { buildPlanView, type PlanView } from '@/lib/inspectionView';

// 관리자 점검 구독 화면의 단일 조회 — 두 가지 관점을 함께 내려보낸다.
//   plans    : 누가 신청했고 입금이 확인됐는지 (구독 목록)
//   schedule : 언제 누가 점검을 예약했는지 (날짜순 일정표 — 전화·방문 점검 모두)
//   settled  : 최근에 완료·취소 처리한 방문 — 잘못 누른 처리를 되돌리는 자리
//   dues     : 납부일이 지났거나 오늘인데 아직 입금 확인 전인 월 납부(매월 자동이체)
// 기사 배정은 이 시스템의 관심사가 아니다(사용자 결정 2026-09-20) — 일정표를 보고
// 오프라인으로 기사를 보낸다. 그래서 여기에 후보 추천·배정 API 가 없다.

const PLAN_LIMIT = 200;
const SCHEDULE_LIMIT = 300;
const SCHEDULE_FUTURE_DAYS = 120;
/** 되돌리기 목록에 남겨 두는 기간(일) — 처리 직후의 실수만 잡으면 된다. */
const SETTLED_RECENT_DAYS = 7;
const SETTLED_LIMIT = 50;

export type AdminInspectionPlanRow = PlanView & {
  loginId: string;
  userName: string;
};

export type AdminInspectionDueRow = {
  paymentId: string;
  planId: string;
  seq: number;
  termMonths: number;
  dueDate: string;
  amountWon: number;
  /** 납부일로부터 지난 일수(0 = 오늘). */
  daysLate: number;
  contactName: string;
  contactPhone: string;
  depositorName: string;
};

/** 월 입금 확인 목록 상한 — 미납이 이만큼 쌓였다면 목록보다 운영 방식을 먼저 봐야 한다. */
const DUE_LIMIT = 300;

export type AdminInspectionScheduleRow = {
  visitId: string;
  planId: string;
  date: string;
  round: number;
  timeSlot: InspectionVisit['timeSlot'];
  method: InspectionVisit['method'];
  status: InspectionVisit['status'];
  note: string | null;
  adminMemo: string | null;
  contactName: string;
  contactPhone: string;
  address: string;
  addressDetail: string | null;
  /** 이 방문이 속한 구독의 이용 기간 — 대리 일정 변경의 날짜 범위가 된다. */
  planStartDate: string | null;
  planEndDate: string | null;
};

const VISIT_PLAN_SELECT = {
  id: true,
  contactName: true,
  contactPhone: true,
  address: true,
  addressDetail: true,
  startDate: true,
  endDate: true,
} as const;

type VisitWithPlan = Prisma.InspectionVisitGetPayload<{
  include: { plan: { select: typeof VISIT_PLAN_SELECT } };
}>;

function toScheduleRow(visit: VisitWithPlan): AdminInspectionScheduleRow {
  return {
    visitId: visit.id,
    planId: visit.plan.id,
    date: toDateString(visit.preferredDate),
    round: visit.round,
    timeSlot: visit.timeSlot,
    method: visit.method,
    status: visit.status,
    note: visit.note,
    adminMemo: visit.adminMemo,
    contactName: visit.plan.contactName,
    contactPhone: visit.plan.contactPhone,
    address: visit.plan.address,
    addressDetail: visit.plan.addressDetail,
    planStartDate: visit.plan.startDate ? toDateString(visit.plan.startDate) : null,
    planEndDate: visit.plan.endDate ? toDateString(visit.plan.endDate) : null,
  };
}

export async function GET(req: NextRequest) {
  if (!(await requireSession('ADMIN'))) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }

  await expireDuePlans();

  const statusParam = req.nextUrl.searchParams.get('status');
  const status =
    statusParam === 'PENDING_PAYMENT' ||
    statusParam === 'ACTIVE' ||
    statusParam === 'EXPIRED' ||
    statusParam === 'CANCELED'
      ? statusParam
      : null;

  const today = todayKst();
  const [plans, visits, settled, pendingCount, dues] = await Promise.all([
    prisma.inspectionPlan.findMany({
      where: status ? { status } : undefined,
      // status 오름차순은 enum 선언 순서를 따른다 — PENDING_PAYMENT 가 첫 값이라
      // 일을 만드는 입금 대기 건이 자연히 맨 위로 온다(의도된 정렬).
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: PLAN_LIMIT,
      include: {
        visits: { orderBy: { round: 'asc' } },
        payments: { orderBy: { seq: 'asc' } },
        user: { select: { loginId: true, name: true } },
      },
    }),
    prisma.inspectionVisit.findMany({
      where: {
        status: { in: ['REQUESTED', 'SCHEDULED'] },
        // 과거 쪽은 자르지 않는다 — 완료 처리를 잊은 방문이 며칠 뒤 일정표에서 사라지면
        // 그 방문을 닫을 화면이 어디에도 없게 된다. 열린 방문은 본래 몇 건 안 된다.
        preferredDate: { lte: fromDateString(addDays(today, SCHEDULE_FUTURE_DAYS)) },
        // 기간이 막 끝난 구독도 포함한다 — 마지막 날 방문은 다음 날이면 구독이 EXPIRED 가
        // 되는데, 여기서 빠지면 그 방문을 완료 처리할 길이 사라진다.
        plan: { status: { in: ['ACTIVE', 'EXPIRED'] } },
      },
      orderBy: [{ preferredDate: 'asc' }, { timeSlot: 'asc' }],
      take: SCHEDULE_LIMIT,
      include: { plan: { select: VISIT_PLAN_SELECT } },
    }),
    prisma.inspectionVisit.findMany({
      where: {
        status: { in: ['COMPLETED', 'CANCELED'] },
        updatedAt: { gte: new Date(Date.now() - SETTLED_RECENT_DAYS * 86_400_000) },
        // 구독째 취소된 방문은 되돌릴 대상이 아니다(구독 취소는 별개의 결정).
        plan: { status: { in: ['ACTIVE', 'EXPIRED'] } },
      },
      orderBy: { updatedAt: 'desc' },
      take: SETTLED_LIMIT,
      include: { plan: { select: VISIT_PLAN_SELECT } },
    }),
    prisma.inspectionPlan.count({ where: { status: 'PENDING_PAYMENT' } }),
    // 해지·만료된 구독의 남은 달은 받을 돈이 아니다 — 이용 중인 구독만 본다.
    prisma.inspectionPayment.findMany({
      where: {
        paidAt: null,
        dueDate: { lte: fromDateString(today) },
        plan: { status: 'ACTIVE' },
      },
      orderBy: [{ dueDate: 'asc' }, { seq: 'asc' }],
      take: DUE_LIMIT,
      include: {
        plan: {
          select: { id: true, termMonths: true, contactName: true, contactPhone: true, depositorName: true },
        },
      },
    }),
  ]);

  return NextResponse.json(
    {
      today,
      pendingCount,
      plans: plans.map<AdminInspectionPlanRow>((plan) => ({
        ...buildPlanView(plan, 'admin'),
        loginId: plan.user.loginId,
        userName: plan.user.name,
      })),
      schedule: visits.map(toScheduleRow),
      settled: settled.map(toScheduleRow),
      dues: dues.map<AdminInspectionDueRow>((p) => {
        const dueDate = toDateString(p.dueDate);
        return {
          paymentId: p.id,
          planId: p.plan.id,
          seq: p.seq,
          termMonths: p.plan.termMonths,
          dueDate,
          amountWon: p.amountWon,
          daysLate: daysBetween(dueDate, today),
          contactName: p.plan.contactName,
          contactPhone: p.plan.contactPhone,
          depositorName: p.plan.depositorName,
        };
      }),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
