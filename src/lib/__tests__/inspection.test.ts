import { describe, expect, it } from 'vitest';
import {
  INSPECTION_MIN_LEAD_DAYS,
  addDays,
  addMonths,
  applyDateIssue,
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

  it('90일을 넘는 날짜를 막는다', () => {
    expect(applyDateIssue(addDays(today, 90), today)).toBeNull();
    expect(applyDateIssue(addDays(today, 91), today)).toContain('90일 이내');
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
    expect(issue).toContain('1분기 방문은 2026-09-20 ~ 2026-12-19');
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

describe('표기', () => {
  it('요일까지 붙인 한국어 날짜를 만든다', () => {
    expect(formatVisitDate('2026-09-20')).toBe('2026년 9월 20일 (일)');
    expect(formatVisitDate('2026-09-21')).toBe('2026년 9월 21일 (월)');
  });
});
