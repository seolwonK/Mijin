import { describe, expect, it } from 'vitest';
import {
  INSPECTION_MIN_LEAD_DAYS,
  addDays,
  adminVisitDateIssue,
  bookingBlock,
  canTransitionVisit,
  formatDateRange,
  addMonths,
  applyDateIssue,
  applyLatestDate,
  daysBetween,
  formatVisitDate,
  freeRound,
  fromDateString,
  INSPECTION_PRICING,
  isDateString,
  isYearBookable,
  planLabel,
  planPricing,
  planEndDate,
  planYears,
  roundsOfYear,
  termOfMonths,
  toDateString,
  todayKst,
  visitDateIssue,
  yearOfDate,
  yearOfRound,
  yearWindow,
} from '@/lib/inspection';

describe('날짜 문자열', () => {
  it('실재하지 않는 날짜를 거른다', () => {
    expect(isDateString('2026-09-20')).toBe(true);
    expect(isDateString('2026-02-29')).toBe(false); // 2026 은 평년
    expect(isDateString('2024-02-29')).toBe(true); // 윤년
    expect(isDateString('2026-13-01')).toBe(false);
    expect(isDateString('2026-09-31')).toBe(false);
    expect(isDateString('2026-9-20')).toBe(false); // 0 패딩 필수
    expect(isDateString('')).toBe(false);
    expect(isDateString(null)).toBe(false);
  });

  it('UTC 자정 Date 와 왕복한다', () => {
    const d = fromDateString('2026-09-20');
    expect(d.toISOString()).toBe('2026-09-20T00:00:00.000Z');
    expect(toDateString(d)).toBe('2026-09-20');
  });

  it('todayKst 는 프로세스 타임존이 아니라 KST 달력을 따른다', () => {
    // 2026-09-20T15:30Z = KST 2026-09-21 00:30 — UTC 기준으로는 아직 20일이다.
    expect(todayKst(new Date('2026-09-20T15:30:00Z'))).toBe('2026-09-21');
    expect(todayKst(new Date('2026-09-20T14:59:00Z'))).toBe('2026-09-20');
  });

  it('일 단위 덧셈이 월·연 경계를 넘는다', () => {
    expect(addDays('2026-09-20', 15)).toBe('2026-10-05');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-09-20', '2026-10-05')).toBe(15);
  });

  it('개월 덧셈은 말일을 클램프한다', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29'); // 윤년
    expect(addMonths('2026-01-31', 3)).toBe('2026-04-30');
    expect(addMonths('2026-08-15', 12)).toBe('2027-08-15');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
  });
});

describe('요금표 — 사용자 결정 2026-09-28', () => {
  it('2년권 월 5,500원(공급가 5,000 + 수수료 500) × 24 = 132,000원', () => {
    const p = INSPECTION_PRICING.TWO_YEAR;
    expect([p.months, p.monthlyWon, p.supplyWon, p.feeWon, p.totalWon]).toEqual([
      24, 5_500, 5_000, 500, 132_000,
    ]);
  });

  it('1년권 월 7,700원(공급가 7,000 + 수수료 700) × 12 = 92,400원', () => {
    const p = INSPECTION_PRICING.ONE_YEAR;
    expect([p.months, p.monthlyWon, p.supplyWon, p.feeWon, p.totalWon]).toEqual([
      12, 7_700, 7_000, 700, 92_400,
    ]);
  });

  it('요금표와 총액이 다른 개편 전 구독은 요금제로 치지 않는다 — 제시한 적 없는 월 요금을 만들지 않게', () => {
    expect(planPricing(24, 132_000)?.term).toBe('TWO_YEAR');
    expect(planPricing(12, 92_400)?.term).toBe('ONE_YEAR');
    expect(planPricing(12, 50_000)).toBeNull();
    expect(planLabel(12, 50_000)).toBe('기존 요금제(1년)');
    expect(planLabel(24, 132_000)).toBe('2년권');
  });

  it('저장된 기간(개월)에서 요금제를 되찾는다', () => {
    expect(termOfMonths(12)).toBe('ONE_YEAR');
    expect(termOfMonths(24)).toBe('TWO_YEAR');
    expect(planYears(12)).toBe(1);
    expect(planYears(24)).toBe(2);
  });
});

describe('이용 기간과 연차 창', () => {
  it('마지막 날은 시작일 + 기간 - 1일이다', () => {
    expect(planEndDate('2026-09-20', 12)).toBe('2027-09-19');
    expect(planEndDate('2026-09-20', 24)).toBe('2028-09-19');
    // 윤일 가입: +12개월이 평년 2월 28일로 클램프된 뒤 하루를 뺀다
    expect(planEndDate('2024-02-29', 12)).toBe('2025-02-27');
  });

  it('두 연차가 빈틈·겹침 없이 맞물린다', () => {
    const y1 = yearWindow('2026-09-20', 1);
    const y2 = yearWindow('2026-09-20', 2);
    expect([y1.start, y1.lastDay]).toEqual(['2026-09-20', '2027-09-19']);
    expect(y1.endExclusive).toBe(y2.start);
    expect(y2.lastDay).toBe(planEndDate('2026-09-20', 24));
  });

  it('날짜가 속한 연차를 되찾는다 — 기간 밖이면 null', () => {
    const start = '2026-09-20';
    expect(yearOfDate(start, 24, '2026-09-20')).toBe(1);
    expect(yearOfDate(start, 24, '2027-09-19')).toBe(1);
    expect(yearOfDate(start, 24, '2027-09-20')).toBe(2);
    expect(yearOfDate(start, 12, '2027-09-20')).toBeNull(); // 1년권은 2년차가 없다
    expect(yearOfDate(start, 24, '2026-09-19')).toBeNull();
  });

  it('회차 번호는 1년차 1~12, 2년차 13~24', () => {
    expect(yearOfRound(1)).toBe(1);
    expect(yearOfRound(12)).toBe(1);
    expect(yearOfRound(13)).toBe(2);
    expect(roundsOfYear(2)).toEqual([13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
  });
});

describe('새 점검의 회차 배정 (freeRound)', () => {
  it('비어 있는 가장 작은 번호를 준다', () => {
    expect(freeRound([], 1)).toBe(1);
    expect(freeRound([{ round: 1, status: 'SCHEDULED' }, { round: 3, status: 'COMPLETED' }], 1)).toBe(2);
    expect(freeRound([{ round: 1, status: 'SCHEDULED' }], 2)).toBe(13);
  });

  it('취소된 회차는 다시 쓴다', () => {
    expect(freeRound([{ round: 1, status: 'CANCELED' }], 1)).toBe(1);
  });

  it('12회를 다 쓰면 null — 다른 연차의 몫은 건드리지 않는다', () => {
    const full = roundsOfYear(1).map((round) => ({ round, status: 'COMPLETED' as const }));
    expect(freeRound(full, 1)).toBeNull();
    expect(freeRound(full, 2)).toBe(13);
  });
});

describe('신청서의 1회차 희망일 (입금 전 — 구독 시작일이 아직 없다)', () => {
  const today = '2026-09-20';

  it('리드타임 안쪽 날짜를 막는다 — 전화 점검이라 내일부터', () => {
    expect(INSPECTION_MIN_LEAD_DAYS).toBe(1);
    expect(applyDateIssue('2026-09-20', today)).toContain('2026년 9월 21일부터');
    expect(applyDateIssue(addDays(today, INSPECTION_MIN_LEAD_DAYS), today)).toBeNull();
  });

  it('오늘부터 한 달 안의 날짜만 받는다', () => {
    expect(applyLatestDate(today)).toBe('2026-10-19');
    expect(applyDateIssue('2026-10-19', today)).toBeNull();
    expect(applyDateIssue('2026-10-20', today)).toContain('2026년 10월 19일까지');
  });

  it('형식이 틀린 값을 막는다', () => {
    expect(applyDateIssue('2026-02-30', today)).toBe('희망 날짜를 선택해 주세요.');
  });
});

describe('활성 구독의 점검 예약', () => {
  const startDate = '2026-09-20';
  const base = { startDate, termMonths: 24, today: '2026-10-01' };

  it('이용 기간 안이면 아무 날이나 된다 — 한 달에 여러 번도', () => {
    expect(visitDateIssue({ ...base, date: '2026-10-02' })).toBeNull();
    expect(visitDateIssue({ ...base, date: '2026-10-03' })).toBeNull();
    expect(visitDateIssue({ ...base, date: '2028-09-19' })).toBeNull(); // 2년권 마지막 날
  });

  it('이용 기간 밖은 막는다', () => {
    expect(visitDateIssue({ ...base, date: '2028-09-20' })).toContain('이용 기간');
    expect(visitDateIssue({ ...base, termMonths: 12, date: '2027-09-20' })).toContain('이용 기간');
  });

  it('기존 회차의 날짜 변경은 그 회차의 연차 안에서만', () => {
    expect(visitDateIssue({ ...base, date: '2027-09-20', round: 3 })).toContain(
      '3회차는 2026년 9월 20일 ~ 2027년 9월 19일',
    );
    expect(visitDateIssue({ ...base, date: '2027-09-20', round: 13 })).toBeNull();
  });

  it('오늘·과거는 막는다', () => {
    expect(visitDateIssue({ ...base, date: '2026-10-01' })).toContain('2026년 10월 2일부터');
  });

  it('연차 창이 끝나면 그 연차는 예약 불가', () => {
    expect(isYearBookable(startDate, 1, '2027-09-17')).toBe(true); // 09-18·19 가능
    expect(isYearBookable(startDate, 1, '2027-09-18')).toBe(true); // 09-19 가능
    expect(isYearBookable(startDate, 1, '2027-09-19')).toBe(false);
    expect(isYearBookable(startDate, 2, '2027-09-19')).toBe(true);
  });
});

describe('고객이 회차의 날짜를 바꿀 수 있는가 (bookingBlock)', () => {
  const startDate = '2026-09-20';
  const block = (today: string, visit: Parameters<typeof bookingBlock>[0]['visit'], round = 1) =>
    bookingBlock({ startDate, round, today, visit });

  it('완료된 회차는 다시 잡을 수 없다', () => {
    expect(block('2026-10-01', { date: '2026-09-25', status: 'COMPLETED' })).toBe('COMPLETED');
  });

  it('관리자가 취소한 점검은 고객이 새 날짜로 다시 잡을 수 있다', () => {
    expect(block('2026-10-01', { date: '2026-10-05', status: 'CANCELED' })).toBeNull();
  });

  it('확정된 점검은 전날까지 바꿀 수 있고 당일부터 잠긴다', () => {
    const visit = { date: '2026-10-10', status: 'SCHEDULED' } as const;
    expect(block('2026-10-09', visit)).toBeNull(); // 전날 — 아직 바꿀 수 있다
    expect(block('2026-10-10', visit)).toBe('VISIT_IMMINENT'); // 당일
    expect(block('2026-10-11', visit)).toBe('VISIT_IMMINENT'); // 지났지만 아직 완료 처리 전
  });

  it('입금 지연으로 날짜가 지난 1회차(REQUESTED)는 잠그지 않는다 — 다시 골라야 하므로', () => {
    expect(block('2026-10-01', { date: '2026-09-25', status: 'REQUESTED' })).toBeNull();
  });

  it('회차의 연차가 끝났으면 WINDOW_PASSED', () => {
    expect(block('2027-09-19', { date: '2026-09-25', status: 'REQUESTED' })).toBe('WINDOW_PASSED');
    expect(block('2027-09-19', { date: '2027-10-01', status: 'CANCELED' }, 13)).toBeNull();
  });
});

describe('관리자의 점검 상태 전이', () => {
  it('정방향과 되돌리기만 허용한다', () => {
    expect(canTransitionVisit('SCHEDULED', 'COMPLETED')).toBe(true);
    expect(canTransitionVisit('SCHEDULED', 'CANCELED')).toBe(true);
    expect(canTransitionVisit('REQUESTED', 'CANCELED')).toBe(true);
    expect(canTransitionVisit('COMPLETED', 'SCHEDULED')).toBe(true); // 되돌리기
    expect(canTransitionVisit('CANCELED', 'SCHEDULED')).toBe(true); // 되돌리기
    expect(canTransitionVisit('REQUESTED', 'COMPLETED')).toBe(false); // 확정 전 완료 금지
    expect(canTransitionVisit('COMPLETED', 'CANCELED')).toBe(false);
    expect(canTransitionVisit('CANCELED', 'COMPLETED')).toBe(false);
  });
});

describe('관리자의 대리 일정 변경', () => {
  const term = { startDate: '2026-09-20', endDate: '2027-09-19' };

  it('리드타임을 강제하지 않는다 — 구독 기간 안이고 과거가 아니면 된다', () => {
    expect(adminVisitDateIssue({ ...term, date: '2026-10-01', today: '2026-10-01' })).toBeNull();
    expect(adminVisitDateIssue({ ...term, date: '2027-01-15', today: '2026-10-01' })).toBeNull();
    expect(adminVisitDateIssue({ ...term, date: '2027-09-19', today: '2026-10-01' })).toBeNull();
  });

  it('기존 회차를 옮길 때는 그 회차의 연차 안에서만 — 1년차 몫을 2년차로 넘기지 않는다', () => {
    const two = { startDate: '2026-09-20', endDate: '2028-09-19', today: '2026-10-01' };
    expect(adminVisitDateIssue({ ...two, date: '2027-10-01', round: 5 })).toContain('5회차는');
    expect(adminVisitDateIssue({ ...two, date: '2027-10-01', round: 13 })).toBeNull();
  });

  it('과거·구독 기간 밖·형식 오류는 막는다', () => {
    expect(adminVisitDateIssue({ ...term, date: '2026-09-30', today: '2026-10-01' })).toContain('지난 날짜');
    expect(adminVisitDateIssue({ ...term, date: '2027-09-20', today: '2026-10-01' })).toContain('이용 기간');
    expect(adminVisitDateIssue({ ...term, date: 'x', today: '2026-10-01' })).toContain('선택');
  });
});

describe('표기', () => {
  it('기간은 같은 해면 뒤쪽 연도를 생략한다', () => {
    expect(formatDateRange('2026-09-20', '2026-12-19')).toBe('2026년 9월 20일 ~ 12월 19일');
    expect(formatDateRange('2026-12-20', '2027-03-19')).toBe('2026년 12월 20일 ~ 2027년 3월 19일');
  });

  it('요일까지 붙인 한국어 날짜를 만든다', () => {
    expect(formatVisitDate('2026-09-20')).toBe('2026년 9월 20일 (일)');
    expect(formatVisitDate('2026-09-21')).toBe('2026년 9월 21일 (월)');
  });
});
