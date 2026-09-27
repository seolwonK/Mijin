// 정기 전기점검 구독 도메인 — 가격·기간·분기 창·예약일 검증의 단일 진실 원천.
//
// 상품: 연 50,000원, 분기마다 1회씩 1년에 4회 방문 점검. 결제는 계좌이체(무통장입금)이고
// 관리자가 입금을 확인하면 그날부터 1년이 시작된다(사용자 결정 2026-09-20: "가입일 기준 4구간").
//
// ── 날짜를 왜 문자열로 다루나 ──────────────────────────────────────────────
// 예약일·구독 기간은 **시각이 없는 날짜**다. Date 로 들고 다니면 KST/UTC 사이에서 하루가
// 밀리는 사고가 반복되므로(이 저장소가 lib/kst.ts 로 이미 한 번 겪은 문제) 이 모듈의 계약은
// 전부 'YYYY-MM-DD' 문자열이고, DB 경계(@db.Date ↔ UTC 자정 Date)에서만 변환한다.
// ISO 날짜 문자열은 사전순 비교 = 시간순 비교라 대소 비교도 문자열 그대로 한다.
import { kstDateString } from '@/lib/kst';

/** 연회비(원). 신청 시점 값이 InspectionPlan.priceWon 에 동결된다 — 인상해도 기존 구독은 불변. */
export const INSPECTION_PRICE_WON = 50_000;
/** 1년에 받는 방문 횟수 = 분기 수. */
export const INSPECTION_VISITS_PER_TERM = 4;
/** 구독 1건의 기간(개월). */
export const INSPECTION_TERM_MONTHS = 12;
/** 분기 1구간의 길이(개월). */
export const INSPECTION_QUARTER_MONTHS = INSPECTION_TERM_MONTHS / INSPECTION_VISITS_PER_TERM;
/** 방문 준비에 필요한 최소 리드타임(일). 오늘·내일 방문 요청은 받지 않는다. */
export const INSPECTION_MIN_LEAD_DAYS = 2;

export type Quarter = 1 | 2 | 3 | 4;
export const INSPECTION_QUARTERS: readonly Quarter[] = [1, 2, 3, 4];

export type TimeSlot = 'MORNING' | 'AFTERNOON' | 'ANY';
export const TIME_SLOTS: readonly TimeSlot[] = ['MORNING', 'AFTERNOON', 'ANY'];

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

export function isQuarter(value: unknown): value is Quarter {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

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
 * 클램프하지 않으면 Date 가 3월로 넘겨 버려, 말일 가입자의 분기 경계가 한 달씩 밀린다.
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

// ── 구독 기간과 분기 창 ─────────────────────────────────────────────────────

export type QuarterWindow = {
  quarter: Quarter;
  /** 이 분기에 예약할 수 있는 첫날 (포함). */
  start: string;
  /** 다음 분기 첫날 (미포함) — 경계 비교는 항상 `< endExclusive` 로 한다. */
  endExclusive: string;
  /** 이 분기의 마지막 날 (포함) — 화면 표기용. */
  lastDay: string;
};

/** 구독 마지막 날(포함). 시작일 + 12개월 - 1일. */
export function planEndDate(startDate: string): string {
  return addDays(addMonths(startDate, INSPECTION_TERM_MONTHS), -1);
}

/** 가입일 기준 3개월씩 나눈 분기 창. */
export function quarterWindow(startDate: string, quarter: Quarter): QuarterWindow {
  const start = addMonths(startDate, INSPECTION_QUARTER_MONTHS * (quarter - 1));
  const endExclusive = addMonths(startDate, INSPECTION_QUARTER_MONTHS * quarter);
  return { quarter, start, endExclusive, lastDay: addDays(endExclusive, -1) };
}

export function quarterWindows(startDate: string): QuarterWindow[] {
  return INSPECTION_QUARTERS.map((q) => quarterWindow(startDate, q));
}

/** 날짜가 속한 분기. 구독 기간 밖이면 null. */
export function quarterOf(startDate: string, date: string): Quarter | null {
  for (const q of INSPECTION_QUARTERS) {
    const w = quarterWindow(startDate, q);
    if (date >= w.start && date < w.endExclusive) return q;
  }
  return null;
}

// ── 예약일 검증 ─────────────────────────────────────────────────────────────
//
// 실패 사유를 **사용자에게 보여 줄 문장**으로 돌려준다. 통과면 null.
// 라우트와 화면이 같은 함수를 쓰므로 "서버는 막는데 화면은 통과시키는" 어긋남이 생기지 않는다.

/**
 * 신청서에서 고를 수 있는 가장 늦은 1회차 희망일.
 *
 * 이 시점엔 아직 입금 전이라 구독 시작일이 없다. 그래서 "오늘 바로 입금이 확인된다면"의
 * 1분기 창을 상한으로 쓴다 — 시작일은 그보다 늦어질 수만 있으므로, 이 안에서 고른 날짜는
 * 확인이 희망일보다 늦어지지 않는 한 언제나 1분기 창 안에 든다. 일수(90일)로 자르면
 * 2월을 낀 석 달(89일)에서 화면이 내준 날짜를 당일 확인으로도 지킬 수 없게 된다.
 */
export function applyLatestDate(today: string): string {
  return quarterWindow(today, 1).lastDay;
}

/** 신청서에서 받는 1분기 희망일 — 아직 구독 시작일이 없어 상대 창으로만 검증한다. */
export function applyDateIssue(date: string, today: string): string | null {
  if (!isDateString(date)) return '희망 날짜를 선택해 주세요.';
  const earliest = addDays(today, INSPECTION_MIN_LEAD_DAYS);
  if (date < earliest) {
    return `방문 준비를 위해 ${INSPECTION_MIN_LEAD_DAYS}일 뒤(${formatDate(earliest)})부터 선택할 수 있습니다.`;
  }
  const latest = applyLatestDate(today);
  if (date > latest) {
    return `첫 점검은 ${formatDate(latest)}까지의 날짜로 선택해 주세요.`;
  }
  return null;
}

/** 활성 구독의 분기 예약(신규·변경) — 분기 창 안이면서 리드타임을 지켰는가. */
export function visitDateIssue(opts: {
  date: string;
  quarter: Quarter;
  startDate: string;
  today: string;
}): string | null {
  const { date, quarter, startDate, today } = opts;
  if (!isDateString(date)) return '희망 날짜를 선택해 주세요.';
  const w = quarterWindow(startDate, quarter);
  if (date < w.start || date >= w.endExclusive) {
    return `${quarter}회차 방문은 ${formatDateRange(w.start, w.lastDay)} 사이에서 선택해 주세요.`;
  }
  const earliest = addDays(today, INSPECTION_MIN_LEAD_DAYS);
  if (date < earliest) {
    return `방문 준비를 위해 ${INSPECTION_MIN_LEAD_DAYS}일 뒤(${formatDate(earliest)})부터 선택할 수 있습니다.`;
  }
  return null;
}

/**
 * 그 분기를 지금 예약할 수 있는가 — 창이 이미 지났으면 잡을 날짜가 없다.
 * (창이 아직 오지 않은 미래 분기는 미리 잡아도 된다. 고객이 일정을 먼저 비워 두는 쪽이 낫다.)
 */
export function isQuarterBookable(
  startDate: string,
  quarter: Quarter,
  today: string,
): boolean {
  const w = quarterWindow(startDate, quarter);
  return addDays(today, INSPECTION_MIN_LEAD_DAYS) < w.endExclusive;
}

// ── 방문 상태와 고객 예약 가능 판정 ─────────────────────────────────────────
//
// Prisma enum(InspectionVisitStatus)과 같은 값이지만 여기서 다시 선언한다 — 이 모듈은
// 클라이언트 번들에도 들어가므로 @prisma/client 를 끌어오지 않는다.

export type VisitStatus = 'REQUESTED' | 'SCHEDULED' | 'COMPLETED' | 'CANCELED';

/** 고객이 그 회차의 날짜를 잡거나 바꿀 수 없는 이유. */
export type BookingBlock =
  /** 이미 점검을 마친 회차. */
  | 'COMPLETED'
  /** 확정된 방문이 코앞(리드타임 안쪽)이거나 이미 지났다 — 기사가 움직이고 있을 수 있다. */
  | 'VISIT_IMMINENT'
  /** 분기 창이 끝나 고를 날짜가 남아 있지 않다. */
  | 'WINDOW_PASSED';

/**
 * 고객이 이 회차를 지금 예약·변경할 수 있는가. 막혀 있으면 그 이유, 아니면 null.
 *
 * 화면(buildPlanView)과 서버(api/my/inspection/visits)가 같은 함수를 쓴다 — 화면은
 * "날짜 변경" 버튼을 보여 주는데 서버는 거절하는(또는 그 반대) 어긋남을 구조적으로 없앤다.
 *
 * 취소된 방문(CANCELED)은 막지 않는다: 관리자가 방문을 취소했다면 고객이 새 날짜를
 * 골라야 그 회차를 쓸 수 있다.
 */
export function bookingBlock(opts: {
  startDate: string;
  quarter: Quarter;
  today: string;
  visit: { date: string; status: VisitStatus } | null;
}): BookingBlock | null {
  const { startDate, quarter, today, visit } = opts;
  if (visit?.status === 'COMPLETED') return 'COMPLETED';
  // "방문 N일 전까지 바꿀 수 있다"는 약속의 서버 쪽 절반. REQUESTED 는 아직 확정 전이라
  // (입금 지연으로 날짜가 지난 1회차가 여기 해당) 잠그지 않는다.
  if (
    visit?.status === 'SCHEDULED' &&
    visit.date < addDays(today, INSPECTION_MIN_LEAD_DAYS)
  ) {
    return 'VISIT_IMMINENT';
  }
  if (!isQuarterBookable(startDate, quarter, today)) return 'WINDOW_PASSED';
  return null;
}

/** 서버가 거절할 때 고객에게 보여 줄 문장. 화면의 안내 문구와 뜻이 같아야 한다. */
export const BOOKING_BLOCK_MESSAGE: Record<BookingBlock, string> = {
  COMPLETED: '이미 점검이 완료된 회차입니다.',
  VISIT_IMMINENT: '방문이 임박했거나 지난 일정은 직접 바꿀 수 없습니다. 고객센터로 문의해 주세요.',
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
 * 관리자의 대리 일정 변경 — 전화로 요청받아 옮겨 주는 경우다. 고객 규칙과 달리 리드타임과
 * 분기 창을 강제하지 않는다(지나간 회차의 보충 방문을 다음 분기 안에 잡아 주는 일이 실제로
 * 생긴다). 구독 기간 안이고 과거가 아니기만 하면 된다.
 */
export function adminVisitDateIssue(opts: {
  date: string;
  startDate: string;
  endDate: string;
  today: string;
}): string | null {
  const { date, startDate, endDate, today } = opts;
  if (!isDateString(date)) return '방문 날짜를 선택해 주세요.';
  if (date < today) return '지난 날짜로는 옮길 수 없습니다.';
  if (date < startDate || date > endDate) {
    return `방문일은 이용 기간(${startDate} ~ ${endDate}) 안에서 선택해 주세요.`;
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
