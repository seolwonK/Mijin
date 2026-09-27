import { describe, expect, it } from 'vitest';
import {
  addMonthsToKey,
  calendarWeeks,
  clampDate,
  lastDayOfMonth,
  monthKey,
} from '@/lib/inspectionCalendar';

// 달력 격자의 기하. 컴포넌트는 node 환경 러너가 닿지 않으므로(DOM 없음) 조용히 틀릴 수 있는
// 계산 — 말일·윤년·연 경계·주 잘라내기 — 만 여기서 못박는다.

describe('monthKey · addMonthsToKey · lastDayOfMonth · clampDate', () => {
  it('날짜에서 달만 떼어 낸다', () => {
    expect(monthKey('2026-09-24')).toBe('2026-09');
  });

  it('연 경계를 넘어간다', () => {
    expect(addMonthsToKey('2026-12', 1)).toBe('2027-01');
    expect(addMonthsToKey('2026-01', -1)).toBe('2025-12');
    expect(addMonthsToKey('2026-09', 0)).toBe('2026-09');
    expect(addMonthsToKey('2026-09', 12)).toBe('2027-09');
  });

  it('말일 — 윤년 2월을 29일로 센다', () => {
    expect(lastDayOfMonth('2028-02')).toBe('2028-02-29');
    expect(lastDayOfMonth('2027-02')).toBe('2027-02-28');
    expect(lastDayOfMonth('2026-09')).toBe('2026-09-30');
    expect(lastDayOfMonth('2026-12')).toBe('2026-12-31');
  });

  it('범위 밖 값을 경계로 접는다', () => {
    expect(clampDate('2026-08-01', '2026-09-24', '2026-12-21')).toBe('2026-09-24');
    expect(clampDate('2027-01-01', '2026-09-24', '2026-12-21')).toBe('2026-12-21');
    expect(clampDate('2026-10-05', '2026-09-24', '2026-12-21')).toBe('2026-10-05');
  });
});

describe('calendarWeeks', () => {
  const FULL = { min: '2026-01-01', max: '2027-12-31' };

  it('일요일에서 시작하고 앞쪽 빈칸을 그 달의 첫 요일만큼 둔다', () => {
    // 2026-09-01 은 화요일(2) — 일·월 두 칸이 비어야 1일이 화요일 열에 선다.
    const weeks = calendarWeeks({ month: '2026-09', ...FULL });
    expect(weeks[0].slice(0, 2)).toEqual([null, null]);
    expect(weeks[0][2]).toBe('2026-09-01');
  });

  it('모든 주가 7칸이고 그 달의 날짜가 하루도 빠지지 않는다', () => {
    for (const month of ['2026-02', '2026-09', '2028-02', '2026-12']) {
      const weeks = calendarWeeks({ month, ...FULL });
      expect(weeks.every((w) => w.length === 7)).toBe(true);
      const days = weeks.flat().filter((d): d is string => d != null);
      expect(days.length).toBe(Number(lastDayOfMonth(month).slice(8)));
      expect(days.every((d) => monthKey(d) === month)).toBe(true);
      // 하루씩 연속인가 — 중복·누락이면 여기서 깨진다.
      expect(days).toEqual([...days].sort());
      expect(new Set(days).size).toBe(days.length);
    }
  });

  it('고를 수 있는 날이 하나도 없는 주는 지운다', () => {
    // 신청서의 실제 경계: 오늘이 2026-09-22 면 9/24 부터 고를 수 있다.
    // 9월 앞쪽 세 주는 통째로 지나간 날이라 화면에서 빠져야 한다.
    const weeks = calendarWeeks({ month: '2026-09', min: '2026-09-24', max: '2026-12-21' });
    expect(weeks.length).toBe(2);
    expect(weeks[0]).toContain('2026-09-24');
    expect(weeks.flat()).not.toContain('2026-09-01');
    // 남은 주 안의 지나간 날짜는 그대로 자리를 지킨다 — 요일 열이 어긋나지 않게.
    expect(weeks[0]).toContain('2026-09-20');
  });

  it('마지막 달에서는 창이 끝난 뒷주가 빠진다', () => {
    const weeks = calendarWeeks({ month: '2026-12', min: '2026-09-24', max: '2026-12-21' });
    expect(weeks.flat()).toContain('2026-12-21');
    expect(weeks.flat()).not.toContain('2026-12-31');
  });

  it('창이 한 주 안에서 시작해 끝나면 그 한 주만 남는다', () => {
    const weeks = calendarWeeks({ month: '2026-10', min: '2026-10-06', max: '2026-10-08' });
    expect(weeks.length).toBe(1);
    expect(weeks[0]).toContain('2026-10-06');
    expect(weeks[0]).toContain('2026-10-08');
  });

  it('그 달에 고를 수 있는 날이 없으면 자르지 않은 격자를 돌려준다', () => {
    // 호출부에서는 생기지 않지만(커서가 min~max 달로 갇힌다) 빈 달력을 그리지 않는다는 보장.
    const weeks = calendarWeeks({ month: '2026-10', min: '2026-11-01', max: '2026-11-30' });
    expect(weeks.length).toBeGreaterThan(0);
    expect(weeks.flat()).toContain('2026-10-15');
  });

  it('윤년 2월도 하루가 남거나 모자라지 않는다', () => {
    const days = calendarWeeks({ month: '2028-02', ...FULL })
      .flat()
      .filter(Boolean);
    expect(days.at(-1)).toBe('2028-02-29');
  });
});
