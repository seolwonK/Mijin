import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { addDays, fromDateString, toDateString, todayKst } from '@/lib/inspection';
import { expireDuePlans } from '@/lib/inspectionLifecycle';
import { buildPlanView, type PlanView } from '@/lib/inspectionView';

// 관리자 점검 구독 화면의 단일 조회 — 두 가지 관점을 함께 내려보낸다.
//   plans    : 누가 신청했고 입금이 확인됐는지 (구독 목록)
//   schedule : 언제 누가 방문을 예약했는지 (날짜순 일정표)
// 기사 배정은 이 시스템의 관심사가 아니다(사용자 결정 2026-09-20) — 일정표를 보고
// 오프라인으로 기사를 보낸다. 그래서 여기에 후보 추천·배정 API 가 없다.

const PLAN_LIMIT = 200;
const SCHEDULE_LIMIT = 300;
/** 일정표에 남겨 두는 과거 구간 — 지난 방문의 완료 처리를 놓치지 않도록. */
const SCHEDULE_PAST_DAYS = 14;
const SCHEDULE_FUTURE_DAYS = 120;

export type AdminInspectionPlanRow = PlanView & {
  loginId: string;
  userName: string;
};

export type AdminInspectionScheduleRow = {
  visitId: string;
  planId: string;
  date: string;
  quarter: number;
  timeSlot: string;
  status: string;
  note: string | null;
  adminMemo: string | null;
  contactName: string;
  contactPhone: string;
  address: string;
  addressDetail: string | null;
};

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
  const [plans, visits, pendingCount] = await Promise.all([
    prisma.inspectionPlan.findMany({
      where: status ? { status } : undefined,
      // status 오름차순은 enum 선언 순서를 따른다 — PENDING_PAYMENT 가 첫 값이라
      // 일을 만드는 입금 대기 건이 자연히 맨 위로 온다(의도된 정렬).
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: PLAN_LIMIT,
      include: {
        visits: { orderBy: { quarter: 'asc' } },
        user: { select: { loginId: true, name: true } },
      },
    }),
    prisma.inspectionVisit.findMany({
      where: {
        status: { in: ['REQUESTED', 'SCHEDULED'] },
        preferredDate: {
          gte: fromDateString(addDays(today, -SCHEDULE_PAST_DAYS)),
          lte: fromDateString(addDays(today, SCHEDULE_FUTURE_DAYS)),
        },
        plan: { status: 'ACTIVE' },
      },
      orderBy: [{ preferredDate: 'asc' }, { timeSlot: 'asc' }],
      take: SCHEDULE_LIMIT,
      include: {
        plan: {
          select: {
            id: true,
            contactName: true,
            contactPhone: true,
            address: true,
            addressDetail: true,
          },
        },
      },
    }),
    prisma.inspectionPlan.count({ where: { status: 'PENDING_PAYMENT' } }),
  ]);

  return NextResponse.json(
    {
      today,
      pendingCount,
      plans: plans.map<AdminInspectionPlanRow>((plan) => ({
        ...buildPlanView(plan),
        loginId: plan.user.loginId,
        userName: plan.user.name,
      })),
      schedule: visits.map<AdminInspectionScheduleRow>((visit) => ({
        visitId: visit.id,
        planId: visit.plan.id,
        date: toDateString(visit.preferredDate),
        quarter: visit.quarter,
        timeSlot: visit.timeSlot,
        status: visit.status,
        note: visit.note,
        adminMemo: visit.adminMemo,
        contactName: visit.plan.contactName,
        contactPhone: visit.plan.contactPhone,
        address: visit.plan.address,
        addressDetail: visit.plan.addressDetail,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
