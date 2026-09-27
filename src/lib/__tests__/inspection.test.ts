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
  fromDateString,
  isDateString,
  isQuarterBookable,
  planEndDate,
  quarterOf,
  quarterWindows,
  toDateString,
  todayKst,
  visitDateIssue,
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

describe('분기 창 — 가입일 기준 3개월씩 4구간', () => {
  it('네 구간이 빈틈·겹침 없이 1년을 덮는다', () => {
    const windows = quarterWindows('2026-09-20');
    expect(windows.map((w) => w.start)).toEqual([
      '2026-09-20',
      '2026-12-20',
      '2027-03-20',
      '2027-06-20',
    ]);
    // 각 분기의 끝은 다음 분기의 시작과 정확히 맞물린다
    for (let i = 0; i < windows.length - 1; i++) {
      expect(windows[i].endExclusive).toBe(windows[i + 1].start);
      expect(addDays(windows[i].lastDay, 1)).toBe(windows[i].endExclusive);
    }
    expect(windows[3].endExclusive).toBe('2027-09-20');
  });

  it('구독 마지막 날은 시작일 + 1년 - 1일이다', () => {
    expect(planEndDate('2026-09-20')).toBe('2027-09-19');
    // 윤일 가입: +12개월이 평년 2월 28일로 클램프된 뒤 하루를 뺀다
    expect(planEndDate('2024-02-29')).toBe('2025-02-27');
  });

  it('말일 가입도 분기가 밀리지 않는다', () => {
    const windows = quarterWindows('2026-01-31');
    expect(windows.map((w) => w.start)).toEqual([
      '2026-01-31',
      '2026-04-30',
      '2026-07-31',
      '2026-10-31',
    ]);
    expect(windows[3].endExclusive).toBe('2027-01-31');
    expect(planEndDate('2026-01-31')).toBe('2027-01-30');
  });

  it('날짜가 속한 분기를 되찾는다', () => {
    const start = '2026-09-20';
    expect(quarterOf(start, '2026-09-20')).toBe(1); // 시작일 당일은 1분기
    expect(quarterOf(start, '2026-12-19')).toBe(1); // 경계 직전
    expect(quarterOf(start, '2026-12-20')).toBe(2); // 경계 당일은 다음 분기
    expect(quarterOf(start, '2027-09-19')).toBe(4); // 마지막 날
    expect(quarterOf(start, '2027-09-20')).toBeNull(); // 구독 종료 다음 날
    expect(quarterOf(start, '2026-09-19')).toBeNull(); // 시작 전날
  });
});

describe('신청서의 1분기 희망일 (입금 전 — 구독 시작일이 아직 없다)', () => {
  const today = '2026-09-20';

  it('리드타임 안쪽 날짜를 막는다', () => {
    expect(applyDateIssue('2026-09-20', today)).toContain('2일 뒤');
    expect(applyDateIssue('2026-09-21', today)).toContain('2일 뒤');
    expect(applyDateIssue(addDays(today, INSPECTION_MIN_LEAD_DAYS), today)).toBeNull();
  });

  it('오늘 확인된다고 쳤을 때의 1분기 마지막 날까지만 받는다', () => {
    expect(applyLatestDate(today)).toBe('2026-12-19');
    expect(applyDateIssue('2026-12-19', today)).toBeNull();
    expect(applyDateIssue('2026-12-20', today)).toContain('2026년 12월 19일까지');
  });

  it('화면이 내준 가장 늦은 날짜는 당일 확인이면 반드시 1분기 창 안이다 — 2월을 낀 석 달 포함', () => {
    // 일수(90일)로 자르던 때는 2027-02-01 신청의 상한이 5/2 였고, 1분기 창은 4/30 에 끝났다.
    for (const day of ['2027-02-01', '2026-11-30', '2028-02-29', '2026-03-01', '2026-08-31']) {
      const latest = applyLatestDate(day);
      expect(quarterOf(day, latest), `${day} 신청의 상한 ${latest}`).toBe(1);
    }
  });

  it('형식이 틀린 값을 막는다', () => {
    expect(applyDateIssue('2026-02-30', today)).toBe('희망 날짜를 선택해 주세요.');
  });
});

describe('활성 구독의 분기 예약', () => {
  const startDate = '2026-09-20';

  it('분기 창 밖의 날짜를 막는다', () => {
    const issue = visitDateIssue({
      date: '2026-12-20', // 2분기 첫날
      quarter: 1,
      startDate,
      today: '2026-10-01',
    });
    expect(issue).toContain('1회차 방문은 2026년 9월 20일 ~ 12월 19일');
  });

  it('창 안이면서 리드타임을 지키면 통과한다', () => {
    expect(
      visitDateIssue({ date: '2026-12-19', quarter: 1, startDate, today: '2026-10-01' }),
    ).toBeNull();
    expect(
      visitDateIssue({ date: '2027-06-20', quarter: 4, startDate, today: '2026-10-01' }),
    ).toBeNull(); // 미래 분기 선예약 허용
  });

  it('창 안이어도 모레보다 이른 날짜는 막는다', () => {
    const issue = visitDateIssue({
      date: '2026-10-02',
      quarter: 1,
      startDate,
      today: '2026-10-01',
    });
    expect(issue).toContain('2일 뒤');
  });

  it('창이 이미 지난 분기는 예약 불가로 판정한다', () => {
    // 1분기 창은 2026-12-19 까지(endExclusive 2026-12-20). 리드타임 2일이 창 안에 남아야 한다.
    expect(isQuarterBookable(startDate, 1, '2026-10-01')).toBe(true);
    expect(isQuarterBookable(startDate, 1, '2026-12-17')).toBe(true); // 12-19 예약 가능
    expect(isQuarterBookable(startDate, 1, '2026-12-18')).toBe(false); // 가장 이른 날이 창 밖
    expect(isQuarterBookable(startDate, 4, '2026-12-18')).toBe(true);
  });
});

describe('고객이 회차를 예약·변경할 수 있는가 (bookingBlock)', () => {
  const startDate = '2026-09-20';
  const block = (today: string, visit: Parameters<typeof bookingBlock>[0]['visit'], quarter = 1) =>
    bookingBlock({ startDate, quarter: quarter as 1 | 2 | 3 | 4, today, visit });

  it('아직 날짜가 없는 회차는 창이 남아 있으면 열려 있다', () => {
    expect(block('2026-10-01', null)).toBeNull();
    expect(block('2026-12-18', null)).toBe('WINDOW_PASSED');
  });

  it('완료된 회차는 다시 잡을 수 없다', () => {
    expect(block('2026-10-01', { date: '2026-09-25', status: 'COMPLETED' })).toBe('COMPLETED');
  });

  it('관리자가 취소한 방문은 고객이 새 날짜로 다시 잡을 수 있다', () => {
    expect(block('2026-10-01', { date: '2026-10-05', status: 'CANCELED' })).toBeNull();
  });

  it('확정된 방문은 리드타임 안쪽으로 들어오면 잠긴다 — "방문 2일 전까지"', () => {
    const visit = { date: '2026-10-10', status: 'SCHEDULED' } as const;
    expect(block('2026-10-08', visit)).toBeNull(); // 정확히 2일 전 — 아직 바꿀 수 있다
    expect(block('2026-10-09', visit)).toBe('VISIT_IMMINENT'); // 하루 전
    expect(block('2026-10-10', visit)).toBe('VISIT_IMMINENT'); // 당일
    expect(block('2026-10-11', visit)).toBe('VISIT_IMMINENT'); // 지났지만 아직 완료 처리 전
  });

  it('입금 지연으로 날짜가 지난 1회차(REQUESTED)는 잠그지 않는다 — 다시 골라야 하므로', () => {
    expect(block('2026-10-01', { date: '2026-09-25', status: 'REQUESTED' })).toBeNull();
  });
});

describe('관리자의 방문 상태 전이', () => {
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

  it('리드타임과 분기 창을 강제하지 않는다 — 구독 기간 안이고 과거가 아니면 된다', () => {
    expect(adminVisitDateIssue({ ...term, date: '2026-10-01', today: '2026-10-01' })).toBeNull();
    // 1회차 보충 방문을 2분기 창 안에 잡는 경우
    expect(adminVisitDateIssue({ ...term, date: '2027-01-15', today: '2026-10-01' })).toBeNull();
    expect(adminVisitDateIssue({ ...term, date: '2027-09-19', today: '2026-10-01' })).toBeNull();
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
