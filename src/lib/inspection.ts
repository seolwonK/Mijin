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
/**
 * 신청서에서 받는 1분기 희망일의 상한(일). 이 시점엔 아직 입금 전이라 구독 시작일이 없어
 * 분기 창으로 검증할 수 없다 — 1분기 길이(3개월)에 해당하는 이 창으로만 거른다.
 */
export const INSPECTION_APPLY_WINDOW_DAYS = 90;

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

/** 오늘이 속한 분기 — 아직 예약하지 않은 분기 중 "지금 잡아야 할 것"을 화면에서 강조할 때 쓴다. */
export function currentQuarter(startDate: string, today: string): Quarter | null {
  return quarterOf(startDate, today);
}

// ── 예약일 검증 ─────────────────────────────────────────────────────────────
//
// 실패 사유를 **사용자에게 보여 줄 문장**으로 돌려준다. 통과면 null.
// 라우트와 화면이 같은 함수를 쓰므로 "서버는 막는데 화면은 통과시키는" 어긋남이 생기지 않는다.

/** 신청서에서 받는 1분기 희망일 — 아직 구독 시작일이 없어 상대 창으로만 검증한다. */
export function applyDateIssue(date: string, today: string): string | null {
  if (!isDateString(date)) return '희망 날짜를 선택해 주세요.';
  const earliest = addDays(today, INSPECTION_MIN_LEAD_DAYS);
  if (date < earliest) {
    return `방문 준비를 위해 ${INSPECTION_MIN_LEAD_DAYS}일 뒤(${earliest})부터 선택할 수 있습니다.`;
  }
  const latest = addDays(today, INSPECTION_APPLY_WINDOW_DAYS);
  if (date > latest) {
    return `첫 점검은 신청일로부터 ${INSPECTION_APPLY_WINDOW_DAYS}일 이내로 선택해 주세요.`;
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
    return `${quarter}분기 방문은 ${w.start} ~ ${w.lastDay} 사이에서 선택해 주세요.`;
  }
  const earliest = addDays(today, INSPECTION_MIN_LEAD_DAYS);
  if (date < earliest) {
    return `방문 준비를 위해 ${INSPECTION_MIN_LEAD_DAYS}일 뒤(${earliest})부터 선택할 수 있습니다.`;
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

// ── 표기 ────────────────────────────────────────────────────────────────────

/** '2026-09-20' → '2026년 9월 20일 (일)' */
export function formatVisitDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][
    fromDateString(date).getUTCDay()
  ];
  return `${y}년 ${m}월 ${d}일 (${weekday})`;
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
