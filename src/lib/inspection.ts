// 정기 전기점검 구독 도메인 — 요금제·기간·연차 창·예약일 검증의 단일 진실 원천.
//
// 상품(사용자 결정 2026-09-28): 1년에 12회, 고객이 원하는 날짜에 **전화(유선)로** 점검한다.
// 모든 회차에 기사가 가지 않는다 — 통화 결과 플랫폼이 필요하다고 판단한 회차만 관리자가
// 방문 점검(ONSITE)으로 돌린다. 요금은 1년권 월 7,700원·2년권 월 5,500원(각각 공급가
// 7,000원·5,000원 + 수수료 10%)이고, 기간 총액을 계좌이체로 한 번에 입금한다. 관리자가 입금을
// 확인한 날부터 기간이 시작된다.
//
// 12회는 **이용 연차(시작일 기준 1년 단위) 안에서 자유롭게** 쓴다(한 달에 여러 번도 가능).
// 회차 번호는 1년차 1~12, 2년차 13~24 — 번호가 곧 "어느 연차의 몫인가"를 말한다.
//
// ── 날짜를 왜 문자열로 다루나 ──────────────────────────────────────────────
// 예약일·구독 기간은 **시각이 없는 날짜**다. Date 로 들고 다니면 KST/UTC 사이에서 하루가
// 밀리는 사고가 반복되므로(이 저장소가 lib/kst.ts 로 이미 한 번 겪은 문제) 이 모듈의 계약은
// 전부 'YYYY-MM-DD' 문자열이고, DB 경계(@db.Date ↔ UTC 자정 Date)에서만 변환한다.
// ISO 날짜 문자열은 사전순 비교 = 시간순 비교라 대소 비교도 문자열 그대로 한다.
import { kstDateString } from '@/lib/kst';

export type InspectionTerm = 'ONE_YEAR' | 'TWO_YEAR';
export const INSPECTION_TERMS: readonly InspectionTerm[] = ['TWO_YEAR', 'ONE_YEAR'];

export type InspectionPricing = {
  term: InspectionTerm;
  /** 이용 기간(개월) — InspectionPlan.termMonths 에 저장되는 값. */
  months: number;
  /** 화면에 내세우는 월 요금(수수료 포함). */
  monthlyWon: number;
  /** 월 공급가. */
  supplyWon: number;
  /** 월 수수료 = monthlyWon - supplyWon. */
  feeWon: number;
  /** 기간 총액 = 한 번에 입금하는 금액. InspectionPlan.priceWon 에 동결된다. */
  totalWon: number;
  label: string;
};

function pricing(term: InspectionTerm, months: number, supplyWon: number, monthlyWon: number, label: string): InspectionPricing {
  return {
    term,
    months,
    monthlyWon,
    supplyWon,
    feeWon: monthlyWon - supplyWon,
    totalWon: monthlyWon * months,
    label,
  };
}

/** 요금표. 신청 시점 값이 InspectionPlan.priceWon 에 동결된다 — 인상해도 기존 구독은 불변. */
export const INSPECTION_PRICING: Record<InspectionTerm, InspectionPricing> = {
  ONE_YEAR: pricing('ONE_YEAR', 12, 7_000, 7_700, '1년권'),
  TWO_YEAR: pricing('TWO_YEAR', 24, 5_000, 5_500, '2년권'),
};

/** 가장 싼 월 요금 — 랜딩·홈 머리글의 "월 5,500원부터". */
export const INSPECTION_MIN_MONTHLY_WON = INSPECTION_PRICING.TWO_YEAR.monthlyWon;

/** 이용 연차 1년마다 받는 점검 횟수. */
export const INSPECTION_CHECKS_PER_YEAR = 12;
/** 회차 번호의 상한 — 2년권의 마지막 회차. */
export const INSPECTION_MAX_ROUND = INSPECTION_CHECKS_PER_YEAR * 2;
/** 점검 준비에 필요한 최소 리드타임(일). 전화 점검이라 내일부터 받는다. */
export const INSPECTION_MIN_LEAD_DAYS = 1;

export function termOfMonths(months: number): InspectionTerm {
  return months >= 24 ? 'TWO_YEAR' : 'ONE_YEAR';
}

/**
 * 이 구독이 지금 요금표의 어느 요금제로 들었는가. 동결된 총액이 요금표와 다르면(개편 전
 * 연 50,000원 구독이 1년권으로 전환된 경우 등) null — 그런 구독에 "월 7,700원"이나
 * 총액을 나눈 "월 4,167원"을 붙이면 제시한 적 없는 가격이 된다.
 */
export function planPricing(termMonths: number, priceWon: number): InspectionPricing | null {
  const pricing = INSPECTION_PRICING[termOfMonths(termMonths)];
  return pricing.months === termMonths && pricing.totalWon === priceWon ? pricing : null;
}

/** 구독의 요금제 이름 — 요금표와 맞지 않는 구독은 "기존 요금제". */
export function planLabel(termMonths: number, priceWon: number): string {
  return planPricing(termMonths, priceWon)?.label ?? `기존 요금제(${planYears(termMonths)}년)`;
}

/** 이용 기간의 연차 수(1년권 1, 2년권 2). */
export function planYears(termMonths: number): number {
  return Math.max(1, Math.round(termMonths / 12));
}

/** 회차가 속한 이용 연차(1부터). */
export function yearOfRound(round: number): number {
  return Math.ceil(round / INSPECTION_CHECKS_PER_YEAR);
}

/** 그 연차의 회차 번호들 — 2년차면 13~24. */
export function roundsOfYear(year: number): number[] {
  const first = (year - 1) * INSPECTION_CHECKS_PER_YEAR + 1;
  return Array.from({ length: INSPECTION_CHECKS_PER_YEAR }, (_, i) => first + i);
}

export type TimeSlot = 'MORNING' | 'AFTERNOON' | 'ANY';
export const TIME_SLOTS: readonly TimeSlot[] = ['MORNING', 'AFTERNOON', 'ANY'];

export type InspectionMethod = 'PHONE' | 'ONSITE';
export const METHOD_LABEL: Record<InspectionMethod, string> = {
  PHONE: '전화 점검',
  ONSITE: '방문 점검',
};

/** 문장 안에 넣는 한 줄 표기("오전(09~12시)에 방문"). */
export const TIME_SLOT_LABEL: Record<TimeSlot, string> = {
  MORNING: '오전(09~12시)',
  AFTERNOON: '오후(13~18시)',
  ANY: '시간 무관',
};
/** 선택 버튼의 윗줄. 괄호까지 넣으면 좁은 화면에서 두 줄로 깨진다. */
export const TIME_SLOT_SHORT: Record<TimeSlot, string> = {
  MORNING: '오전',
  AFTERNOON: '오후',
  ANY: '무관',
};
/** 선택 버튼의 아랫줄 — 실제 방문 시간대. */
export const TIME_SLOT_RANGE: Record<TimeSlot, string> = {
  MORNING: '09~12시',
  AFTERNOON: '13~18시',
  ANY: '언제든',
};

// ── 날짜 문자열 유틸 ────────────────────────────────────────────────────────

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' 형식이면서 실재하는 날짜인가 (2026-02-30 은 거짓). */
export function isDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
  );
}

/** 'YYYY-MM-DD' → UTC 자정 Date. Prisma `@db.Date` 가 읽고 쓰는 표현과 같다. */
export function fromDateString(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * `@db.Date` 로 읽은 Date → 'YYYY-MM-DD'.
 * UTC 접근자만 쓴다 — 프로세스 타임존이 KST 든 UTC 든 같은 값이 나와야 한다.
 */
export function toDateString(value: Date): string {
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 오늘(한국 기준). 서버가 어느 타임존이든 KST 달력 날짜를 돌려준다. */
export function todayKst(now: Date = new Date()): string {
  return kstDateString(now);
}

export function addDays(date: string, days: number): string {
  const d = fromDateString(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateString(d);
}

/**
 * 개월 덧셈 — **말일 클램프**. 1월 31일 + 1개월은 존재하지 않는 2월 31일이 아니라 2월 28(29)일이다.
 * 클램프하지 않으면 Date 가 3월로 넘겨 버려, 말일 가입자의 연차 경계가 하루씩 어긋난다.
 */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const targetMonthIndex = m - 1 + months;
  const lastDayOfTarget = new Date(
    Date.UTC(y, targetMonthIndex + 1, 0),
  ).getUTCDate();
  return toDateString(
    new Date(Date.UTC(y, targetMonthIndex, Math.min(d, lastDayOfTarget))),
  );
}

/** 두 날짜 문자열의 일수 차이 (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (fromDateString(b).getTime() - fromDateString(a).getTime()) / 86_400_000,
  );
}

// ── 구독 기간과 연차 창 ─────────────────────────────────────────────────────

export type YearWindow = {
  year: number;
  /** 이 연차의 첫날 (포함). */
  start: string;
  /** 다음 연차 첫날 (미포함) — 경계 비교는 항상 `< endExclusive` 로 한다. */
  endExclusive: string;
  /** 이 연차의 마지막 날 (포함) — 화면 표기용. */
  lastDay: string;
};

/** 구독 마지막 날(포함). 시작일 + 기간 - 1일. */
export function planEndDate(startDate: string, termMonths: number): string {
  return addDays(addMonths(startDate, termMonths), -1);
}

/** 시작일 기준 1년 단위 연차 창. */
export function yearWindow(startDate: string, year: number): YearWindow {
  const start = addMonths(startDate, 12 * (year - 1));
  const endExclusive = addMonths(startDate, 12 * year);
  return { year, start, endExclusive, lastDay: addDays(endExclusive, -1) };
}

/** 날짜가 속한 이용 연차. 구독 기간 밖이면 null. */
export function yearOfDate(startDate: string, termMonths: number, date: string): number | null {
  for (let year = 1; year <= planYears(termMonths); year++) {
    const w = yearWindow(startDate, year);
    if (date >= w.start && date < w.endExclusive) return year;
  }
  return null;
}

// ── 예약일 검증 ─────────────────────────────────────────────────────────────
//
// 실패 사유를 **사용자에게 보여 줄 문장**으로 돌려준다. 통과면 null.
// 라우트와 화면이 같은 함수를 쓰므로 "서버는 막는데 화면은 통과시키는" 어긋남이 생기지 않는다.

/**
 * 신청서에서 고를 수 있는 가장 늦은 1회차 희망일 — 오늘부터 한 달.
 * 아직 입금 전이라 시작일이 없지만, 어느 요금제든 기간이 1년 이상이라 한 달 안의 날짜는
 * 입금 확인이 희망일보다 늦어지지 않는 한 언제나 이용 기간 안에 든다.
 */
export function applyLatestDate(today: string): string {
  return addDays(addMonths(today, 1), -1);
}

/** 신청서에서 받는 1회차 희망일 — 아직 구독 시작일이 없어 상대 창으로만 검증한다. */
export function applyDateIssue(date: string, today: string): string | null {
  if (!isDateString(date)) return '희망 날짜를 선택해 주세요.';
  const earliest = addDays(today, INSPECTION_MIN_LEAD_DAYS);
  if (date < earliest) {
    return `${formatDate(earliest)}부터 선택할 수 있습니다.`;
  }
  const latest = applyLatestDate(today);
  if (date > latest) {
    return `첫 점검은 ${formatDate(latest)}까지의 날짜로 선택해 주세요.`;
  }
  return null;
}

/**
 * 활성 구독의 고객 예약(신규·변경) — 이용 기간 안이면서 리드타임을 지켰는가.
 * 기존 회차의 날짜를 바꿀 때(round 지정)는 그 회차의 연차 안이어야 한다 — 1년차 몫을
 * 2년차로 넘기면 연차마다 12회라는 약속이 깨진다.
 */
export function visitDateIssue(opts: {
  date: string;
  startDate: string;
  termMonths: number;
  today: string;
  round?: number | null;
}): string | null {
  const { date, startDate, termMonths, today, round } = opts;
  if (!isDateString(date)) return '희망 날짜를 선택해 주세요.';
  const endDate = planEndDate(startDate, termMonths);
  if (date < startDate || date > endDate) {
    return `이용 기간(${formatDateRange(startDate, endDate)}) 안의 날짜를 선택해 주세요.`;
  }
  if (round != null) {
    const w = yearWindow(startDate, yearOfRound(round));
    if (date < w.start || date >= w.endExclusive) {
      return `${round}회차는 ${formatDateRange(w.start, w.lastDay)} 사이에서 선택해 주세요.`;
    }
  }
  const earliest = addDays(today, INSPECTION_MIN_LEAD_DAYS);
  if (date < earliest) {
    return `${formatDate(earliest)}부터 선택할 수 있습니다.`;
  }
  return null;
}

/** 그 연차에 아직 고를 날짜가 남아 있는가(리드타임 반영). */
export function isYearBookable(startDate: string, year: number, today: string): boolean {
  return addDays(today, INSPECTION_MIN_LEAD_DAYS) < yearWindow(startDate, year).endExclusive;
}

// ── 방문 상태와 고객 예약 가능 판정 ─────────────────────────────────────────
//
// Prisma enum(InspectionVisitStatus)과 같은 값이지만 여기서 다시 선언한다 — 이 모듈은
// 클라이언트 번들에도 들어가므로 @prisma/client 를 끌어오지 않는다.

export type VisitStatus = 'REQUESTED' | 'SCHEDULED' | 'COMPLETED' | 'CANCELED';

/** 회차가 그 연차의 12회 몫을 차지하고 있는가 — 취소된 회차는 다시 쓸 수 있다. */
export function occupiesRound(status: VisitStatus): boolean {
  return status !== 'CANCELED';
}

/**
 * 새 점검을 넣을 회차 번호 — 그 연차에서 비어 있거나 취소된 가장 작은 번호. 12회를 다 썼으면 null.
 */
export function freeRound(
  visits: readonly { round: number; status: VisitStatus }[],
  year: number,
): number | null {
  const taken = new Set(visits.filter((v) => occupiesRound(v.status)).map((v) => v.round));
  return roundsOfYear(year).find((r) => !taken.has(r)) ?? null;
}

/** 고객이 그 회차의 날짜를 바꿀 수 없는 이유. */
export type BookingBlock =
  /** 이미 점검을 마친 회차. */
  | 'COMPLETED'
  /** 확정된 점검이 코앞(리드타임 안쪽)이거나 이미 지났다. */
  | 'VISIT_IMMINENT'
  /** 회차가 속한 연차가 끝나 고를 날짜가 남아 있지 않다. */
  | 'WINDOW_PASSED';

/**
 * 고객이 이 회차를 지금 바꿀 수 있는가. 막혀 있으면 그 이유, 아니면 null.
 *
 * 화면(buildPlanView)과 서버(api/my/inspection/visits)가 같은 함수를 쓴다 — 화면은
 * "날짜 변경" 버튼을 보여 주는데 서버는 거절하는(또는 그 반대) 어긋남을 구조적으로 없앤다.
 *
 * 취소된 점검(CANCELED)은 막지 않는다: 관리자가 취소했다면 고객이 새 날짜를 골라
 * 그 회차를 쓸 수 있다.
 */
export function bookingBlock(opts: {
  startDate: string;
  round: number;
  today: string;
  visit: { date: string; status: VisitStatus } | null;
}): BookingBlock | null {
  const { startDate, round, today, visit } = opts;
  if (visit?.status === 'COMPLETED') return 'COMPLETED';
  // "점검 N일 전까지 바꿀 수 있다"는 약속의 서버 쪽 절반. REQUESTED 는 아직 확정 전이라
  // (입금 지연으로 날짜가 지난 1회차가 여기 해당) 잠그지 않는다.
  if (
    visit?.status === 'SCHEDULED' &&
    visit.date < addDays(today, INSPECTION_MIN_LEAD_DAYS)
  ) {
    return 'VISIT_IMMINENT';
  }
  if (!isYearBookable(startDate, yearOfRound(round), today)) return 'WINDOW_PASSED';
  return null;
}

/** 서버가 거절할 때 고객에게 보여 줄 문장. 화면의 안내 문구와 뜻이 같아야 한다. */
export const BOOKING_BLOCK_MESSAGE: Record<BookingBlock, string> = {
  COMPLETED: '이미 점검이 완료된 회차입니다.',
  VISIT_IMMINENT: '점검일이 임박했거나 지난 일정은 직접 바꿀 수 없습니다. 고객센터로 문의해 주세요.',
  WINDOW_PASSED: '이 회차는 예약 가능 기간이 지났습니다. 고객센터로 문의해 주세요.',
};

/**
 * 관리자가 방문 상태를 옮길 수 있는 경로. 완료·취소에서 SCHEDULED 로 돌아가는 길은
 * 잘못 누른 처리를 되돌리기 위한 것이다(되돌릴 수 없는 한 번의 탭을 만들지 않는다).
 */
const VISIT_TRANSITIONS: Record<VisitStatus, readonly VisitStatus[]> = {
  REQUESTED: ['SCHEDULED', 'CANCELED'],
  SCHEDULED: ['COMPLETED', 'CANCELED'],
  COMPLETED: ['SCHEDULED'],
  CANCELED: ['SCHEDULED'],
};

export function canTransitionVisit(from: VisitStatus, to: VisitStatus): boolean {
  return VISIT_TRANSITIONS[from].includes(to);
}

/**
 * 관리자의 대리 일정 변경·대리 예약 — 전화로 요청받아 처리하는 경우다. 고객 규칙과 달리
 * 리드타임을 강제하지 않는다(통화 결과 당일 방문을 잡는 일이 실제로 생긴다). 구독 기간
 * 안이고 과거가 아니기만 하면 된다.
 */
export function adminVisitDateIssue(opts: {
  date: string;
  startDate: string;
  endDate: string;
  today: string;
  /** 기존 회차를 옮길 때 — 그 회차의 연차 안이어야 한다(연차마다 12회라는 몫이 섞이지 않게). */
  round?: number | null;
}): string | null {
  const { date, startDate, endDate, today, round } = opts;
  if (!isDateString(date)) return '점검 날짜를 선택해 주세요.';
  if (date < today) return '지난 날짜로는 옮길 수 없습니다.';
  if (date < startDate || date > endDate) {
    return `점검일은 이용 기간(${startDate} ~ ${endDate}) 안에서 선택해 주세요.`;
  }
  if (round != null) {
    const w = yearWindow(startDate, yearOfRound(round));
    if (date < w.start || date >= w.endExclusive) {
      return `${round}회차는 ${w.start} ~ ${w.lastDay} 사이에서 선택해 주세요.`;
    }
  }
  return null;
}

// ── 표기 ────────────────────────────────────────────────────────────────────

/** '2026-09-20' → '2026년 9월 20일 (일)' */
export function formatVisitDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][
    fromDateString(date).getUTCDay()
  ];
  return `${y}년 ${m}월 ${d}일 (${weekday})`;
}

/** '2026-09-20' → '2026년 9월 20일' */
export function formatDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

/**
 * 기간 표기. 같은 해면 뒤쪽의 연도를 생략한다 —
 * '2026년 9월 20일 ~ 12월 19일' / '2026년 12월 20일 ~ 2027년 3월 19일'.
 */
export function formatDateRange(start: string, end: string): string {
  const [sy] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  return `${formatDate(start)} ~ ${sy === ey ? `${em}월 ${ed}일` : formatDate(end)}`;
}

/** '2026-09-20' → '9/20' (일정표의 조밀한 표기) */
export function formatShortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}`;
}

export function formatWon(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`;
}

/**
 * 숫자만 저장된 전화번호를 하이픈 표기로. 형식을 모르는 값은 그대로 돌려준다.
 * (lib/sms/templates.ts 에 같은 일을 하는 비공개 함수가 있지만, 그쪽은 문자 본문 전용이라
 *  화면 표기를 위해 export 를 열기보다 화면 계열이 쓰는 이 모듈에 둔다.)
 */
export function formatPhone(digits: string): string {
  if (/^01\d{9}$/.test(digits)) return digits.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1-$2-$3');
  if (/^01\d{8}$/.test(digits)) return digits.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
  if (/^02\d{8}$/.test(digits)) return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, '$1-$2-$3');
  if (/^02\d{7}$/.test(digits)) return digits.replace(/^(\d{2})(\d{3})(\d{4})$/, '$1-$2-$3');
  if (/^0\d{9}$/.test(digits)) return digits.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
  return digits;
}
