// 구독 1건을 화면이 그대로 그릴 수 있는 모양으로 바꾼다.
//
// 분기 창(날짜 범위)·예약 가능 여부는 저장된 값이 아니라 시작일에서 매번 계산되는 파생값이다.
// 고객 화면과 관리자 화면이 각자 계산하면 하루 차이로 어긋나므로, 계산은 여기 한 곳에서만 한다.
import type { InspectionPlan, InspectionVisit } from '@prisma/client';
import {
  type BookingBlock,
  INSPECTION_QUARTERS,
  type Quarter,
  type TimeSlot,
  bookingBlock,
  quarterOf,
  quarterWindow,
  toDateString,
  todayKst,
} from '@/lib/inspection';

/** 누구에게 내려보내는 뷰인가. 고객에게는 관리자 내부 메모를 싣지 않는다. */
export type ViewAudience = 'customer' | 'admin';

export type VisitView = {
  id: string;
  quarter: Quarter;
  date: string;
  timeSlot: TimeSlot;
  status: InspectionVisit['status'];
  note: string | null;
  /** 관리자 전용 — 고객 뷰에서는 항상 null. */
  adminMemo: string | null;
  completedAt: string | null;
};

export type QuarterView = {
  quarter: Quarter;
  /** 이 분기에 예약할 수 있는 기간. 구독이 아직 활성화되지 않았으면 null. */
  window: { start: string; lastDay: string } | null;
  /** 오늘이 이 분기 창 안에 있는가 — "지금 잡아야 할 회차"를 강조할 때 쓴다. */
  isCurrent: boolean;
  /** 지금 이 분기의 날짜를 잡거나 바꿀 수 있는가. */
  bookable: boolean;
  /** bookable 이 거짓인 이유. 활성 구독이 아니면(창 자체가 없으면) null. */
  blocked: BookingBlock | null;
  visit: VisitView | null;
  /**
   * 신청서의 희망일을 확정하지 못해 고객이 날짜를 **다시 골라야** 하는 상태.
   * 활성 구독 안의 REQUESTED 는 activatePlan 이 확정을 보류한 1회차뿐이다(입금 확인이 늦어
   * 날짜가 지났거나 준비 시간이 남지 않은 경우) — 그래서 날짜를 다시 따지지 않고 상태로 읽는다.
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
  /** 신청일(한국 달력). createdAt 을 화면에서 자르면 UTC 날짜가 나와 하루 밀린다. */
  createdDate: string;
  /** 점검을 마친 회차 수. */
  completedCount: number;
  /**
   * 고객이 지금 손을 써야 하는 회차 — 날짜를 다시 골라야 하는 회차가 먼저, 없으면
   * 날짜가 비어 있는 현재 분기. 할 일이 없으면 null.
   */
  actionQuarter: Quarter | null;
  /** 오늘 이후 가장 가까운 확정(SCHEDULED) 방문. 이용 중이 아니거나 없으면 null. */
  nextVisit: { quarter: Quarter; date: string; timeSlot: TimeSlot } | null;
  quarters: QuarterView[];
};

export type PlanWithVisits = InspectionPlan & { visits: InspectionVisit[] };

function toVisitView(visit: InspectionVisit, audience: ViewAudience): VisitView {
  return {
    id: visit.id,
    quarter: visit.quarter as Quarter,
    date: toDateString(visit.preferredDate),
    timeSlot: visit.timeSlot,
    status: visit.status,
    note: visit.note,
    adminMemo: audience === 'admin' ? visit.adminMemo : null,
    completedAt: visit.completedAt?.toISOString() ?? null,
  };
}

export function buildPlanView(
  plan: PlanWithVisits,
  audience: ViewAudience,
  now: Date = new Date(),
): PlanView {
  const today = todayKst(now);
  const startDate = plan.startDate ? toDateString(plan.startDate) : null;
  const byQuarter = new Map<number, InspectionVisit>();
  for (const v of plan.visits) byQuarter.set(v.quarter, v);
  const currentQuarter = startDate ? quarterOf(startDate, today) : null;

  const quarters = INSPECTION_QUARTERS.map<QuarterView>((quarter) => {
    const visit = byQuarter.get(quarter) ?? null;
    const view = visit ? toVisitView(visit, audience) : null;
    // 구독이 활성화되기 전에는 분기 창 자체가 없다 — 시작일이 입금 확인 시점에 정해지기 때문.
    if (!startDate || plan.status !== 'ACTIVE') {
      return {
        quarter,
        window: null,
        isCurrent: false,
        bookable: false,
        blocked: null,
        visit: view,
        needsReschedule: false,
      };
    }
    const w = quarterWindow(startDate, quarter);
    const blocked = bookingBlock({
      startDate,
      quarter,
      today,
      visit: view && { date: view.date, status: view.status },
    });
    const needsReschedule = view?.status === 'REQUESTED';
    return {
      quarter,
      window: { start: w.start, lastDay: w.lastDay },
      isCurrent: quarter === currentQuarter,
      bookable: blocked == null,
      blocked,
      visit: view,
      needsReschedule,
    };
  });

  const needsDate = (q: QuarterView) => q.visit == null || q.visit.status === 'CANCELED';
  const actionQuarter =
    quarters.find((q) => q.bookable && q.needsReschedule)?.quarter ??
    quarters.find((q) => q.bookable && q.isCurrent && needsDate(q))?.quarter ??
    null;

  // 오늘 방문도 "다음 방문"이다 — 기사가 오는 날 고객이 화면을 열면 그 방문이 떠야 한다.
  const upcoming =
    plan.status === 'ACTIVE'
      ? quarters
          .filter((q) => q.visit?.status === 'SCHEDULED' && q.visit.date >= today)
          .sort((a, b) => (a.visit!.date < b.visit!.date ? -1 : 1))[0]
      : undefined;
  const nextVisit =
    upcoming?.visit != null
      ? { quarter: upcoming.quarter, date: upcoming.visit.date, timeSlot: upcoming.visit.timeSlot }
      : null;

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
    createdDate: todayKst(plan.createdAt),
    completedCount: plan.visits.filter((v) => v.status === 'COMPLETED').length,
    actionQuarter,
    nextVisit,
    quarters,
  };
}

/**
 * 고객 화면에서 회차 하나가 어떤 상태로 **보이는가**. 회차 카드의 배지와 진행 막대가 같은
 * 판정을 쓴다 — 둘이 따로 판정하면 "기간이 지났어요" 안내 옆에 "날짜 다시 선택" 배지가 뜨는
 * 모순이 생긴다(1분기 창이 지난 뒤에도 REQUESTED 로 남은 1회차).
 *
 * needsReschedule 자체는 바꾸지 않는다 — 관리자 화면은 창이 지난 REQUESTED 도 "처리할 일"로
 * 봐야 하므로 원래 뜻 그대로 둔다. 고객이 손댈 수 있는지(bookable)는 여기서 거른다.
 */
export type QuarterDisplay =
  | 'COMPLETED'
  | 'SCHEDULED'
  /** 날짜를 다시 골라야 하고, 지금 고를 수 있다. */
  | 'RESCHEDULE'
  /** 관리자가 취소했고, 새 날짜를 고를 수 있다. */
  | 'CANCELED'
  /** 입금 전 신청서의 희망일 — 입금이 확인되어야 확정된다. */
  | 'AWAITING_PAYMENT'
  /** 확정된 방문 없이 분기 창이 끝났다. */
  | 'WINDOW_PASSED'
  | 'UNSET';

export function quarterDisplay(q: QuarterView): QuarterDisplay {
  const status = q.visit?.status;
  if (status === 'COMPLETED') return 'COMPLETED';
  if (status === 'SCHEDULED') return 'SCHEDULED';
  // 확정 방문이 없는 회차만 여기 온다(SCHEDULED 는 창이 끝나기 전에 VISIT_IMMINENT 로 먼저 잠긴다).
  if (q.blocked === 'WINDOW_PASSED') return 'WINDOW_PASSED';
  if (q.needsReschedule) return 'RESCHEDULE';
  if (status === 'CANCELED') return 'CANCELED';
  // 활성 구독의 REQUESTED 는 전부 needsReschedule 로 위에서 걸린다 — 남는 것은 입금 전 희망일.
  if (status === 'REQUESTED') return 'AWAITING_PAYMENT';
  return 'UNSET';
}

/** 회차 카드 배지 문구. 배지를 달지 않는 상태(UNSET)는 null. */
export const QUARTER_DISPLAY_BADGE: Record<QuarterDisplay, string | null> = {
  COMPLETED: '점검 완료',
  SCHEDULED: '방문 예정',
  RESCHEDULE: '날짜 다시 선택',
  CANCELED: '취소됨',
  AWAITING_PAYMENT: '입금 확인 후 확정',
  WINDOW_PASSED: '기간 지남',
  UNSET: null,
};

/**
 * 이용 중 화면 맨 위에 한 줄로 강조할 것 — 고객이 할 일이 있으면 그것이 먼저, 없으면 다음 방문.
 * 할 일과 다음 방문을 둘 다 띄우면 어느 쪽이 중요한지 다시 읽어야 하므로 하나만 고른다.
 */
export type PlanHeadline =
  | { kind: 'RESCHEDULE'; quarter: Quarter }
  | { kind: 'BOOK'; quarter: Quarter }
  | { kind: 'NEXT_VISIT'; quarter: Quarter; date: string; timeSlot: TimeSlot };

export function planHeadline(view: PlanView): PlanHeadline | null {
  if (view.status !== 'ACTIVE') return null;
  if (view.actionQuarter != null) {
    const q = view.quarters.find((x) => x.quarter === view.actionQuarter);
    return { kind: q?.needsReschedule ? 'RESCHEDULE' : 'BOOK', quarter: view.actionQuarter };
  }
  if (view.nextVisit) return { kind: 'NEXT_VISIT', ...view.nextVisit };
  return null;
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
