// 달력 격자의 기하 — 어떤 달을, 어떤 주까지 그릴지.
//
// InspectionCalendar 컴포넌트에서 떼어 둔 이유는 하나다: 이 계산은 말일·윤년·주 경계에서
// 조용히 틀리는 종류이고(2월 29일, 1월 31일 + 1개월, 창이 한 주 안에서 시작해 끝나는 경우),
// 컴포넌트 안에 있으면 테스트가 닿지 않는다. 이 저장소의 단위 테스트는 node 환경이라
// DOM 을 켜지 않는다 — 그래서 도메인·기하는 lib 으로 내리고 화면은 실측으로 검증한다.
//
// 날짜 계약은 lib/inspection.ts 와 같다: 전부 'YYYY-MM-DD' 문자열, 달은 'YYYY-MM'.
import { fromDateString, toDateString } from '@/lib/inspection';

/** 'YYYY-MM-DD' → 'YYYY-MM' */
export function monthKey(date: string): string {
  return date.slice(0, 7);
}

/** 'YYYY-MM' 에 개월을 더한다. */
export function addMonthsToKey(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** 그 달의 마지막 날짜. Date.UTC 의 day=0 은 전달 말일이라 윤년도 그대로 맞는다. */
export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return toDateString(new Date(Date.UTC(y, m, 0)));
}

/** 사전순 비교 = 시간순 비교라 문자열 그대로 자른다. 'YYYY-MM' 끼리도 같은 규칙으로 쓴다. */
export function clampDate(date: string, min: string, max: string): string {
  return date < min ? min : date > max ? max : date;
}

/**
 * 한 달을 주 단위로 쪼갠 격자. 일요일 시작이고, 그 달에 속하지 않는 칸은 null 이다.
 *
 * 고를 수 있는 날이 하나도 없는 주는 빼고 돌려준다 — 시작 달의 이미 지나간 앞쪽 주들과
 * 마지막 달의 남는 뒷주들이 화면 절반을 회색으로 채우던 자리다. 요일 열은 그대로라
 * 달력의 짜임새(일~토 정렬)는 유지된다.
 *
 * 그 달에 고를 수 있는 날이 아예 없으면(호출부에서는 생기지 않지만 방어) 자르지 않은
 * 원래 격자를 돌려준다 — 빈 달력을 그리는 것보다는 낫다.
 */
export function calendarWeeks(opts: {
  month: string;
  min: string;
  max: string;
}): (string | null)[][] {
  const { month, min, max } = opts;
  const leading = fromDateString(`${month}-01`).getUTCDay();
  const dayCount = Number(lastDayOfMonth(month).slice(8));
  const cells: (string | null)[] = [
    ...Array<null>(leading).fill(null),
    ...Array.from({ length: dayCount }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = Array.from({ length: cells.length / 7 }, (_, i) =>
    cells.slice(i * 7, i * 7 + 7),
  );
  const live = weeks.filter((week) => week.some((d) => d != null && d >= min && d <= max));
  return live.length > 0 ? live : weeks;
}
