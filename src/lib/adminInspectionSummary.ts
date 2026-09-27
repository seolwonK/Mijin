// 관리자 대시보드의 "정기 전기점검" 요약 띠 — GET /api/admin/inspections 응답에서 숫자만 뽑는다.
//
// 날짜는 전부 'YYYY-MM-DD' 문자열의 사전순 비교로 판정하고, 오늘은 서버가 준 today(KST)를 쓴다.
// 브라우저에서 오늘을 다시 계산하면 자정 무렵이나 시간대가 다른 기기에서 서버와 하루 어긋난다.
// 이 모듈은 클라이언트 번들에 들어가므로 라우트(서버 전용 import)에서 타입을 끌어오지 않고
// 필요한 필드만 구조적으로 선언한다.
import { TIME_SLOTS, type TimeSlot, addDays } from '@/lib/inspection';

/** 이번 주 방문 = 오늘 포함 앞으로 며칠. */
export const INSPECTION_WEEK_DAYS = 7;
/** 대시보드에 칩으로 늘어놓는 목록의 최대 길이. */
export const INSPECTION_SUMMARY_LIST_LIMIT = 3;

export type InspectionSummaryScheduleRow = {
  visitId: string;
  date: string;
  quarter: number;
  timeSlot: TimeSlot;
  status: 'REQUESTED' | 'SCHEDULED' | 'COMPLETED' | 'CANCELED';
  contactName: string;
  address: string;
};

export type InspectionSummaryPlanRow = {
  id: string;
  status: 'PENDING_PAYMENT' | 'ACTIVE' | 'EXPIRED' | 'CANCELED';
  createdAt: string;
  createdDate: string;
  contactName: string;
  contactPhone: string;
};

export type InspectionSummaryInput = {
  today: string;
  pendingCount: number;
  plans: InspectionSummaryPlanRow[];
  schedule: InspectionSummaryScheduleRow[];
};

export type InspectionSummary = {
  /** 입금 대기 구독 수 — 서버의 정확한 count(plans 목록 상한과 무관). */
  pendingPayment: number;
  /** 오늘 확정(SCHEDULED) 방문 수. */
  todayVisits: number;
  /** 오늘 ~ 오늘+6 확정 방문 수. */
  weekVisits: number;
  /** 처리 필요 = unconfirmed + overdue. */
  needsAction: number;
  /** 고객이 날짜를 다시 골라야 하는 방문(REQUESTED). */
  unconfirmed: number;
  /** 날짜가 지났는데 아직 SCHEDULED 인 방문 — 완료 처리가 필요하다. */
  overdue: number;
  /** 오늘 방문 목록(시간대 순, 최대 3). */
  todayList: { visitId: string; timeSlot: TimeSlot; contactName: string; address: string; quarter: number }[];
  /** 최근 입금 대기 신청(신청 시각 내림차순, 최대 3). */
  recentPending: { planId: string; createdDate: string; contactName: string; contactPhone: string }[];
};

const PROVINCE =
  /^(서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)$|(특별시|광역시|특별자치시|특별자치도|도)$/;

/** '경기 성남시 분당구 정자동 123' → '성남시 분당구'. 칩 한 줄에 들어갈 만큼만 남긴다. */
export function shortAddress(address: string): string {
  const tokens = address.trim().split(/\s+/).filter(Boolean);
  if (tokens.length > 2 && PROVINCE.test(tokens[0])) tokens.shift();
  return tokens.slice(0, 2).join(' ');
}

export function summarizeInspections(data: InspectionSummaryInput): InspectionSummary {
  const { today } = data;
  const weekEnd = addDays(today, INSPECTION_WEEK_DAYS - 1);
  const scheduled = data.schedule.filter((v) => v.status === 'SCHEDULED');
  const todays = scheduled.filter((v) => v.date === today);
  const weekVisits = scheduled.filter((v) => v.date >= today && v.date <= weekEnd).length;
  const unconfirmed = data.schedule.filter((v) => v.status === 'REQUESTED').length;
  const overdue = scheduled.filter((v) => v.date < today).length;

  const todayList = [...todays]
    .sort((a, b) => TIME_SLOTS.indexOf(a.timeSlot) - TIME_SLOTS.indexOf(b.timeSlot))
    .slice(0, INSPECTION_SUMMARY_LIST_LIMIT)
    .map((v) => ({
      visitId: v.visitId,
      timeSlot: v.timeSlot,
      contactName: v.contactName,
      address: shortAddress(v.address),
      quarter: v.quarter,
    }));

  const recentPending = data.plans
    .filter((p) => p.status === 'PENDING_PAYMENT')
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    .slice(0, INSPECTION_SUMMARY_LIST_LIMIT)
    .map((p) => ({
      planId: p.id,
      createdDate: p.createdDate,
      contactName: p.contactName,
      contactPhone: p.contactPhone,
    }));

  return {
    pendingPayment: data.pendingCount,
    todayVisits: todays.length,
    weekVisits,
    needsAction: unconfirmed + overdue,
    unconfirmed,
    overdue,
    todayList,
    recentPending,
  };
}
