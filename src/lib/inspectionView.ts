// 구독 1건을 화면이 그대로 그릴 수 있는 모양으로 바꾼다.
//
// 연차 창(날짜 범위)·남은 횟수·예약 가능 여부는 저장된 값이 아니라 시작일에서 매번 계산되는
// 파생값이다. 고객 화면과 관리자 화면이 각자 계산하면 하루 차이로 어긋나므로, 계산은 여기
// 한 곳에서만 한다.
import type { InspectionPayment, InspectionPlan, InspectionVisit } from '@prisma/client';
import {
  type BookingBlock,
  INSPECTION_CHECKS_PER_YEAR,
  INSPECTION_MIN_LEAD_DAYS,
  type InspectionMethod,
  type InspectionResult,
  type TimeSlot,
  addDays,
  bookingBlock,
  daysBetween,
  isYearBookable,
  occupiesRound,
  planYears,
  toDateString,
  todayKst,
  yearOfDate,
  yearOfRound,
  yearWindow,
} from '@/lib/inspection';

/** 누구에게 내려보내는 뷰인가. 고객에게는 관리자 내부 메모를 싣지 않는다. */
export type ViewAudience = 'customer' | 'admin';

export type VisitView = {
  id: string;
  round: number;
  /** 회차가 속한 이용 연차(1부터). */
  year: number;
  date: string;
  timeSlot: TimeSlot;
  method: InspectionMethod;
  status: InspectionVisit['status'];
  note: string | null;
  /** 관리자 전용 — 고객 뷰에서는 항상 null. */
  adminMemo: string | null;
  /** 점검 결과와 설명 — 고객에게도 보인다. */
  result: InspectionResult | null;
  resultNote: string | null;
  completedAt: string | null;
  /** 고객이 지금 이 회차의 날짜를 바꿀 수 있는가. 활성 구독이 아니면 거짓. */
  bookable: boolean;
  /** bookable 이 거짓인 이유. 활성 구독이 아니면 null. */
  blocked: BookingBlock | null;
  /**
   * 신청서의 희망일을 확정하지 못해 고객이 날짜를 **다시 골라야** 하는 상태.
   * 활성 구독 안의 REQUESTED 는 activatePlan 이 확정을 보류한 1회차뿐이다(입금 확인이 늦어
   * 날짜가 지났거나 준비 시간이 남지 않은 경우) — 그래서 날짜를 다시 따지지 않고 상태로 읽는다.
   */
  needsReschedule: boolean;
};

export type YearView = {
  year: number;
  /** 이 연차의 기간. 구독이 아직 활성화되지 않았으면 null. */
  window: { start: string; lastDay: string } | null;
  /** 연차마다 받는 점검 횟수(12). */
  quota: number;
  /** 날짜가 잡혀 있거나 끝난 회차 수(취소 제외). */
  used: number;
  completed: number;
  /** 아직 날짜를 잡지 않은 횟수 = quota - used. */
  remaining: number;
  /** 오늘이 이 연차 안인가. */
  isCurrent: boolean;
  /** 지금 이 연차에 새 점검을 잡을 수 있는가(남은 횟수 + 남은 날짜). */
  bookable: boolean;
};

/** 월 납부 1건. DUE = 납부일이 지났거나 오늘인데 아직 입금 확인 전(미납은 표시만 한다). */
export type PaymentView = {
  id: string;
  seq: number;
  dueDate: string;
  amountWon: number;
  paidAt: string | null;
  status: 'PAID' | 'DUE' | 'UPCOMING';
  /** DUE 일 때 납부일로부터 지난 일수(0 = 오늘). */
  daysLate: number | null;
  /** 관리자 전용 메모 — 고객 뷰에서는 null. */
  note: string | null;
};

export type BillingView = {
  /** MONTHLY = 매월 자동이체, PREPAID = 개편 전 기간 총액을 이미 낸 구독. */
  mode: 'MONTHLY' | 'PREPAID';
  monthlyWon: number | null;
  paidCount: number;
  totalCount: number;
  /** 입금 확인이 필요한(납부일이 지났거나 오늘인) 납부 수. */
  dueCount: number;
  /** 아직 확인 안 된 가장 이른 납부 — 지난 것 포함. 다 냈거나 일정이 없으면 null. */
  nextDue: { seq: number; dueDate: string; amountWon: number } | null;
  payments: PaymentView[];
};

export type PlanView = {
  id: string;
  status: InspectionPlan['status'];
  termMonths: number;
  priceWon: number;
  /** 월 요금(매월 자동이체액). 개편 전 일시 납부 구독은 null. */
  monthlyWon: number | null;
  billing: BillingView;
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
  /** 환불 기록 — 관리자 뷰에만 싣는다(고객 뷰는 null). */
  refund: { won: number; at: string; note: string | null } | null;
  createdAt: string;
  /** 신청일(한국 달력). createdAt 을 화면에서 자르면 UTC 날짜가 나와 하루 밀린다. */
  createdDate: string;
  /** 점검을 마친 회차 수. */
  completedCount: number;
  /** 날짜순(같은 날이면 회차순) 점검 목록. 취소된 회차도 이력으로 싣는다. */
  visits: VisitView[];
  years: YearView[];
  /**
   * 새 점검을 잡을 때 달력에서 고를 수 있는 범위. 남은 횟수가 있는 연차만 포함한다.
   * 이용 중이 아니거나 잡을 수 있는 날이 없으면 null.
   */
  bookRange: { earliest: string; latest: string } | null;
  /** 이미 점검이 잡힌(취소 제외) 날짜 — 같은 날 두 번 잡지 않게 달력에서 막는다. */
  bookedDates: string[];
  /** 고객이 날짜를 다시 골라야 하는 회차의 방문 id(보류된 1회차). 없으면 null. */
  actionVisitId: string | null;
  /** 오늘 이후 가장 가까운 확정(SCHEDULED) 점검. 이용 중이 아니거나 없으면 null. */
  nextVisit: {
    id: string;
    round: number;
    date: string;
    timeSlot: TimeSlot;
    method: InspectionMethod;
  } | null;
};

export type PlanWithVisits = InspectionPlan & {
  visits: InspectionVisit[];
  /** 납부 일정. 조회에서 빼면(과거 호출부) 빈 일정으로 본다. */
  payments?: InspectionPayment[];
};

function buildBilling(plan: PlanWithVisits, audience: ViewAudience, today: string): BillingView {
  const payments = (plan.payments ?? [])
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map<PaymentView>((p) => {
      const dueDate = toDateString(p.dueDate);
      const paid = p.paidAt != null;
      const due = !paid && dueDate <= today;
      return {
        id: p.id,
        seq: p.seq,
        dueDate,
        amountWon: p.amountWon,
        paidAt: p.paidAt?.toISOString() ?? null,
        status: paid ? 'PAID' : due ? 'DUE' : 'UPCOMING',
        daysLate: due ? daysBetween(dueDate, today) : null,
        note: audience === 'admin' ? p.note : null,
      };
    });
  const next = payments.find((p) => p.status !== 'PAID');
  return {
    mode: plan.monthlyWon != null ? 'MONTHLY' : 'PREPAID',
    monthlyWon: plan.monthlyWon,
    paidCount: payments.filter((p) => p.status === 'PAID').length,
    totalCount: payments.length,
    dueCount: payments.filter((p) => p.status === 'DUE').length,
    nextDue: next ? { seq: next.seq, dueDate: next.dueDate, amountWon: next.amountWon } : null,
    payments,
  };
}

function byDateThenRound(a: VisitView, b: VisitView): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.round - b.round;
}

export function buildPlanView(
  plan: PlanWithVisits,
  audience: ViewAudience,
  now: Date = new Date(),
): PlanView {
  const today = todayKst(now);
  const startDate = plan.startDate ? toDateString(plan.startDate) : null;
  const endDate = plan.endDate ? toDateString(plan.endDate) : null;
  // 연차 창·예약 가능 여부는 활성 구독에만 있다 — 시작일이 입금 확인 시점에 정해지기 때문.
  const active = plan.status === 'ACTIVE' && startDate != null;

  const visits = plan.visits
    .map<VisitView>((v) => {
      const date = toDateString(v.preferredDate);
      const blocked = active
        ? bookingBlock({ startDate, round: v.round, today, visit: { date, status: v.status } })
        : null;
      return {
        id: v.id,
        round: v.round,
        year: yearOfRound(v.round),
        date,
        timeSlot: v.timeSlot,
        method: v.method,
        status: v.status,
        note: v.note,
        adminMemo: audience === 'admin' ? v.adminMemo : null,
        result: v.result,
        resultNote: v.resultNote,
        completedAt: v.completedAt?.toISOString() ?? null,
        bookable: active && blocked == null,
        blocked,
        needsReschedule: active && v.status === 'REQUESTED',
      };
    })
    .sort(byDateThenRound);

  const currentYear = active ? yearOfDate(startDate, plan.termMonths, today) : null;
  const years = Array.from({ length: planYears(plan.termMonths) }, (_, i): YearView => {
    const year = i + 1;
    const mine = visits.filter((v) => v.year === year);
    const used = mine.filter((v) => occupiesRound(v.status)).length;
    const remaining = Math.max(0, INSPECTION_CHECKS_PER_YEAR - used);
    const w = startDate ? yearWindow(startDate, year) : null;
    return {
      year,
      window: w && { start: w.start, lastDay: w.lastDay },
      quota: INSPECTION_CHECKS_PER_YEAR,
      used,
      completed: mine.filter((v) => v.status === 'COMPLETED').length,
      remaining,
      isCurrent: year === currentYear,
      bookable: active && remaining > 0 && isYearBookable(startDate, year, today),
    };
  });

  // 남은 횟수가 있는 연차들의 날짜 범위. 연차는 최대 둘이라 늘 한 덩어리로 이어진다
  // (1년차가 찼으면 2년차만, 2년차가 찼으면 1년차만).
  const openYears = years.filter((y) => y.bookable && y.window);
  const earliestAllowed = addDays(today, INSPECTION_MIN_LEAD_DAYS);
  const bookRange =
    openYears.length > 0
      ? {
          earliest: [openYears[0].window!.start, earliestAllowed].sort().at(-1)!,
          latest: openYears[openYears.length - 1].window!.lastDay,
        }
      : null;

  const bookedDates = [
    ...new Set(visits.filter((v) => occupiesRound(v.status)).map((v) => v.date)),
  ].sort();

  const actionVisitId = visits.find((v) => v.needsReschedule && v.bookable)?.id ?? null;

  // 오늘 점검도 "다음 점검"이다 — 전화가 오는 날 고객이 화면을 열면 그 일정이 떠야 한다.
  const upcoming = active
    ? visits.find((v) => v.status === 'SCHEDULED' && v.date >= today)
    : undefined;
  const nextVisit = upcoming
    ? {
        id: upcoming.id,
        round: upcoming.round,
        date: upcoming.date,
        timeSlot: upcoming.timeSlot,
        method: upcoming.method,
      }
    : null;

  return {
    id: plan.id,
    status: plan.status,
    termMonths: plan.termMonths,
    priceWon: plan.priceWon,
    monthlyWon: plan.monthlyWon,
    billing: buildBilling(plan, audience, today),
    startDate,
    endDate,
    contactName: plan.contactName,
    contactPhone: plan.contactPhone,
    address: plan.address,
    addressDetail: plan.addressDetail,
    memo: plan.memo,
    depositorName: plan.depositorName,
    paidConfirmedAt: plan.paidConfirmedAt?.toISOString() ?? null,
    cancelReason: plan.cancelReason,
    refund:
      audience === 'admin' && plan.refundedWon != null && plan.refundedAt
        ? { won: plan.refundedWon, at: plan.refundedAt.toISOString(), note: plan.refundNote }
        : null,
    createdAt: plan.createdAt.toISOString(),
    createdDate: todayKst(plan.createdAt),
    completedCount: visits.filter((v) => v.status === 'COMPLETED').length,
    visits,
    years,
    bookRange,
    bookedDates,
    actionVisitId,
    nextVisit,
  };
}

/**
 * 고객 화면에서 점검 하나가 어떤 상태로 **보이는가**. 카드의 배지와 목록 강조가 같은 판정을
 * 쓴다 — 둘이 따로 판정하면 "기간이 지났어요" 안내 옆에 "날짜 다시 선택" 배지가 뜨는 모순이 생긴다.
 */
export type VisitDisplay =
  | 'COMPLETED'
  | 'SCHEDULED'
  /** 날짜를 다시 골라야 하고, 지금 고를 수 있다. */
  | 'RESCHEDULE'
  /** 관리자가 취소했다 — 그 회차는 다시 쓸 수 있다. */
  | 'CANCELED'
  /** 입금 전 신청서의 희망일 — 입금이 확인되어야 확정된다. */
  | 'AWAITING_PAYMENT'
  /** 확정되지 못한 채 그 연차가 끝났다. */
  | 'WINDOW_PASSED';

export function visitDisplay(v: VisitView): VisitDisplay {
  if (v.status === 'COMPLETED') return 'COMPLETED';
  if (v.status === 'SCHEDULED') return 'SCHEDULED';
  if (v.status === 'CANCELED') return 'CANCELED';
  // 남는 것은 REQUESTED — 활성 구독이면 재선택 대상, 아니면 입금 전 희망일.
  if (v.blocked === 'WINDOW_PASSED') return 'WINDOW_PASSED';
  if (v.needsReschedule) return 'RESCHEDULE';
  return 'AWAITING_PAYMENT';
}

/** 점검 카드 배지 문구. 예정 배지는 방식에 따라 달라서 visitBadge() 로 고른다. */
export const VISIT_DISPLAY_BADGE: Record<VisitDisplay, string> = {
  COMPLETED: '점검 완료',
  SCHEDULED: '점검 예정',
  RESCHEDULE: '날짜 다시 선택',
  CANCELED: '취소됨',
  AWAITING_PAYMENT: '입금 확인 후 확정',
  WINDOW_PASSED: '기간 지남',
};

export function visitBadge(v: VisitView): string {
  const display = visitDisplay(v);
  if (display === 'SCHEDULED') return v.method === 'ONSITE' ? '방문 예정' : '전화 예정';
  return VISIT_DISPLAY_BADGE[display];
}

/**
 * 이용 중 화면 맨 위에 한 줄로 강조할 것 — 고객이 할 일이 있으면 그것이 먼저, 없으면 다음 점검,
 * 다음 점검도 없으면 남은 횟수로 새 날짜를 잡으라는 안내.
 */
export type PlanHeadline =
  | { kind: 'RESCHEDULE'; visitId: string; round: number }
  | {
      kind: 'NEXT_VISIT';
      visitId: string;
      round: number;
      date: string;
      timeSlot: TimeSlot;
      method: InspectionMethod;
    }
  | { kind: 'BOOK'; remaining: number };

export function planHeadline(view: PlanView): PlanHeadline | null {
  if (view.status !== 'ACTIVE') return null;
  if (view.actionVisitId != null) {
    const v = view.visits.find((x) => x.id === view.actionVisitId)!;
    return { kind: 'RESCHEDULE', visitId: v.id, round: v.round };
  }
  if (view.nextVisit) {
    const { id, ...rest } = view.nextVisit;
    return { kind: 'NEXT_VISIT', visitId: id, ...rest };
  }
  const current = view.years.find((y) => y.isCurrent && y.bookable) ?? view.years.find((y) => y.bookable);
  if (current) return { kind: 'BOOK', remaining: current.remaining };
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
  SCHEDULED: '점검 예정',
  COMPLETED: '점검 완료',
  CANCELED: '취소됨',
};
