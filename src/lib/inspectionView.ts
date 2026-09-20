// 구독 1건을 화면이 그대로 그릴 수 있는 모양으로 바꾼다.
//
// 분기 창(날짜 범위)·예약 가능 여부는 저장된 값이 아니라 시작일에서 매번 계산되는 파생값이다.
// 고객 화면과 관리자 화면이 각자 계산하면 하루 차이로 어긋나므로, 계산은 여기 한 곳에서만 한다.
import type { InspectionPlan, InspectionVisit } from '@prisma/client';
import {
  INSPECTION_QUARTERS,
  type Quarter,
  type TimeSlot,
  isQuarterBookable,
  quarterWindow,
  toDateString,
  todayKst,
} from '@/lib/inspection';

export type VisitView = {
  id: string;
  quarter: Quarter;
  date: string;
  timeSlot: TimeSlot;
  status: InspectionVisit['status'];
  note: string | null;
  adminMemo: string | null;
  completedAt: string | null;
};

export type QuarterView = {
  quarter: Quarter;
  /** 이 분기에 예약할 수 있는 기간. 구독이 아직 활성화되지 않았으면 null. */
  window: { start: string; lastDay: string } | null;
  /** 지금 이 분기의 날짜를 잡거나 바꿀 수 있는가. */
  bookable: boolean;
  visit: VisitView | null;
  /**
   * 입금 확인이 늦어져 희망일이 이미 지난 경우처럼, 날짜를 **다시 골라야** 하는 상태.
   * 화면은 이걸 보고 "날짜를 다시 선택해 주세요"를 띄운다.
   */
  needsReschedule: boolean;
};

export type PlanView = {
  id: string;
  status: InspectionPlan['status'];
  priceWon: number;
  startDate: string | null;
  endDate: string | null;
  contactName: string;
  contactPhone: string;
  address: string;
  addressDetail: string | null;
  memo: string | null;
  depositorName: string;
  paidConfirmedAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  quarters: QuarterView[];
};

export type PlanWithVisits = InspectionPlan & { visits: InspectionVisit[] };

function toVisitView(visit: InspectionVisit): VisitView {
  return {
    id: visit.id,
    quarter: visit.quarter as Quarter,
    date: toDateString(visit.preferredDate),
    timeSlot: visit.timeSlot,
    status: visit.status,
    note: visit.note,
    adminMemo: visit.adminMemo,
    completedAt: visit.completedAt?.toISOString() ?? null,
  };
}

export function buildPlanView(plan: PlanWithVisits, now: Date = new Date()): PlanView {
  const today = todayKst(now);
  const startDate = plan.startDate ? toDateString(plan.startDate) : null;
  const byQuarter = new Map<number, InspectionVisit>();
  for (const v of plan.visits) byQuarter.set(v.quarter, v);

  const quarters = INSPECTION_QUARTERS.map<QuarterView>((quarter) => {
    const visit = byQuarter.get(quarter) ?? null;
    const view = visit ? toVisitView(visit) : null;
    // 구독이 활성화되기 전에는 분기 창 자체가 없다 — 시작일이 입금 확인 시점에 정해지기 때문.
    if (!startDate || plan.status !== 'ACTIVE') {
      return { quarter, window: null, bookable: false, visit: view, needsReschedule: false };
    }
    const w = quarterWindow(startDate, quarter);
    const settled = view != null && (view.status === 'COMPLETED' || view.status === 'CANCELED');
    const bookable = !settled && isQuarterBookable(startDate, quarter, today);
    // 잡힌 날짜가 이미 지났거나(1분기 입금 지연) 분기 창 밖이면 다시 골라야 한다.
    const needsReschedule =
      view != null &&
      view.status === 'REQUESTED' &&
      (view.date < w.start || view.date >= w.endExclusive || view.date < today);
    return {
      quarter,
      window: { start: w.start, lastDay: w.lastDay },
      bookable,
      visit: view,
      needsReschedule,
    };
  });

  return {
    id: plan.id,
    status: plan.status,
    priceWon: plan.priceWon,
    startDate,
    endDate: plan.endDate ? toDateString(plan.endDate) : null,
    contactName: plan.contactName,
    contactPhone: plan.contactPhone,
    address: plan.address,
    addressDetail: plan.addressDetail,
    memo: plan.memo,
    depositorName: plan.depositorName,
    paidConfirmedAt: plan.paidConfirmedAt?.toISOString() ?? null,
    cancelReason: plan.cancelReason,
    createdAt: plan.createdAt.toISOString(),
    quarters,
  };
}

export const PLAN_STATUS_LABEL: Record<InspectionPlan['status'], string> = {
  PENDING_PAYMENT: '입금 대기',
  ACTIVE: '이용 중',
  EXPIRED: '기간 종료',
  CANCELED: '취소됨',
};

export const VISIT_STATUS_LABEL: Record<InspectionVisit['status'], string> = {
  REQUESTED: '날짜 확인 중',
  SCHEDULED: '방문 예정',
  COMPLETED: '점검 완료',
  CANCELED: '취소됨',
};
