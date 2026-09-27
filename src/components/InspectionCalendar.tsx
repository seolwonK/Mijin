'use client';

import { useEffect, useRef, useState } from 'react';
import {
  addDays,
  formatVisitDate,
  fromDateString,
  isDateString,
  todayKst,
} from '@/lib/inspection';
import {
  addMonthsToKey,
  calendarWeeks,
  clampDate,
  lastDayOfMonth,
  monthKey,
} from '@/lib/inspectionCalendar';

// 방문 희망일을 고르는 인라인 달력.
//
// 왜 네이티브 <input type="date"> 를 버렸나 — 이 상품의 날짜 규칙은 "분기 창 안에서, 오늘로부터
// 2일 뒤부터"라 고를 수 있는 구간이 좁고 달을 걸친다. 네이티브 피커는 min/max 로 막기만 할 뿐
// **왜 못 고르는지**를 보여 주지 않고, 모바일에서는 OS 마다 생김새가 달라 "며칠부터 되는지"를
// 고객이 화면의 안내 문장과 피커를 번갈아 보며 맞춰야 했다. 달력을 펼쳐 두면 고를 수 있는 날이
// 한눈에 들어오고 탭 한 번에 끝난다.
//
// 접근성은 WAI-ARIA APG 의 date picker 문법을 따른다 — <table role="grid"> · 셀 하나만
// tabindex=0(로빙) · 방향키로 날짜 이동 · PageUp/PageDown 으로 달 이동.

/**
 * 달력 아래 한 줄 — 고른 날짜를 요일까지 다시 보여 주거나, 아직 안 골랐으면 가장 빠른 날짜로
 * 한 번에 정하는 길을 낸다. "언제든 빨리만 와 주면 된다"는 고객이 달력을 헤매지 않게 하는
 * 지름길이고, 고른 뒤에는 요일 확인이 그 자리를 대신한다.
 */
export function SelectedDateLine({
  date,
  earliest,
  onPickEarliest,
}: {
  date: string;
  earliest: string;
  onPickEarliest: () => void;
}) {
  if (isDateString(date)) {
    return (
      <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-800">
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4 shrink-0"
        >
          <path
            fillRule="evenodd"
            d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
            clipRule="evenodd"
          />
        </svg>
        {formatVisitDate(date)}
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={onPickEarliest}
      className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-white px-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 active:bg-brand-100"
    >
      가장 빠른 날짜로 정하기
      {/* 칩 안에서 연도는 줄만 길게 만든다 — 창이 1년을 넘지 않아 달·일이면 헷갈리지 않는다. */}
      <span className="font-medium text-muted">
        {formatVisitDate(earliest).replace(/^\d+년 /, '')}
      </span>
    </button>
  );
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 일요일 빨강 · 토요일 파랑 — 한국 달력의 관례라 없으면 오히려 낯설다. */
const WEEKDAY_TONE = [
  'text-red-600',
  '',
  '',
  '',
  '',
  '',
  'text-blue-600',
] as const;

export default function InspectionCalendar({
  id,
  value,
  onChange,
  min,
  max,
  label,
  invalid = false,
  describedBy,
}: {
  /** 바깥의 오류 처리가 포커스를 보낼 대상. 로빙 tabindex 를 가진 날짜 버튼에 붙는다. */
  id: string;
  /** 선택된 날짜. 아직 안 골랐으면 ''. */
  value: string;
  onChange: (date: string) => void;
  /** 고를 수 있는 첫날·마지막 날 (둘 다 포함). */
  min: string;
  max: string;
  /** 달력 전체를 읽어 줄 이름 — "1회차 방문 희망일" 처럼. */
  label: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const today = todayKst();
  // 표시 중인 달. 고른 날짜가 있으면 그 달, 없으면 고를 수 있는 첫날이 있는 달에서 시작한다 —
  // "오늘"에서 시작하면 창이 다음 달부터인 회차에서 빈 달을 먼저 보게 된다.
  const [cursor, setCursor] = useState(() =>
    monthKey(isDateString(value) ? value : min),
  );
  // 로빙 tabindex 가 얹힌 날짜. 방향키 이동의 기준점이기도 하다.
  const [focusedDate, setFocusedDate] = useState(() =>
    clampDate(isDateString(value) ? value : today, min, max),
  );
  // 키보드로 옮겼을 때만 실제 포커스를 따라 보낸다 — 마우스·터치 선택으로 화면이 튀지 않게.
  const moveFocus = useRef(false);
  const gridRef = useRef<HTMLTableElement>(null);

  // 바깥에서 값이 바뀌면(빠른 선택 칩 등) 그 달로 따라간다. effect 가 아니라 **렌더 중 보정**인
  // 이유: effect 로 하면 한 번 틀린 달을 그린 뒤 다시 그리게 되고, React 가 권하는 방식도
  // 이쪽이다(you-might-not-need-an-effect / "Adjusting state when a prop changes").
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    if (isDateString(value)) {
      setCursor(monthKey(value));
      setFocusedDate(value);
    }
  }

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-date="${focusedDate}"]`)
      ?.focus();
  }, [focusedDate]);

  const minMonth = monthKey(min);
  const maxMonth = monthKey(max);
  const canGoPrev = cursor > minMonth;
  const canGoNext = cursor < maxMonth;

  function goMonth(delta: number) {
    const next = clampDate(
      addMonthsToKey(cursor, delta),
      minMonth,
      maxMonth,
    );
    setCursor(next);
  }

  /** 방향키 이동 — 범위를 벗어나면 끝에서 멈추고, 달을 넘으면 표시 달도 따라간다. */
  function moveTo(date: string) {
    const next = clampDate(date, min, max);
    moveFocus.current = true;
    setFocusedDate(next);
    setCursor(monthKey(next));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const key = e.key;
    const delta =
      key === 'ArrowLeft' ? -1
      : key === 'ArrowRight' ? 1
      : key === 'ArrowUp' ? -7
      : key === 'ArrowDown' ? 7
      : null;
    if (delta != null) {
      e.preventDefault();
      moveTo(addDays(focusedDate, delta));
      return;
    }
    if (key === 'Home' || key === 'End') {
      e.preventDefault();
      // 그 주의 일요일 / 토요일로.
      const weekday = fromDateString(focusedDate).getUTCDay();
      moveTo(addDays(focusedDate, key === 'Home' ? -weekday : 6 - weekday));
      return;
    }
    if (key === 'PageUp' || key === 'PageDown') {
      e.preventDefault();
      const month = addMonthsToKey(monthKey(focusedDate), key === 'PageUp' ? -1 : 1);
      // 같은 날짜가 그 달에 없으면(1/31 → 2월) 말일로 붙인다.
      const day = Number(focusedDate.slice(8));
      const last = lastDayOfMonth(month);
      moveTo(day > Number(last.slice(8)) ? last : `${month}-${focusedDate.slice(8)}`);
    }
  }

  // ── 달력 격자 ── (기하는 lib/inspectionCalendar 가 소유한다 — 말일·윤년이 걸린 계산이라
  // 단위 테스트가 닿아야 한다.)
  const firstOfMonth = `${cursor}-01`;
  const weeks = calendarWeeks({ month: cursor, min, max });

  const [cursorYear, cursorMonth] = cursor.split('-').map(Number);
  // 격자 안에 로빙 대상이 없으면(달 이동 직후) 그 달의 첫 선택 가능일이 tabindex 를 받는다 —
  // 탭으로 들어온 사용자가 어디로도 들어가지 못하는 상태를 만들지 않는다.
  const rovingDate =
    monthKey(focusedDate) === cursor
      ? focusedDate
      : clampDate(firstOfMonth, min, max) <= lastDayOfMonth(cursor)
        ? clampDate(firstOfMonth, min, max)
        : null;

  return (
    <div
      // 넓은 화면에서 폼 너비(max-w-2xl)만큼 늘어나면 날짜 칸이 섬처럼 흩어진다 — 달력은
      // 한 손에 잡히는 너비가 읽기 좋다.
      // 모바일은 좌우 여백을 px-1 로 줄인다 — 7칸이 나눠 쓰는 폭이 곧 날짜 칸 폭이라, p-3 이면
      // 375px 화면에서 칸이 40px 로 줄어 터치 목표(44px)에 못 미쳤다.
      className={`rounded-2xl border bg-white px-1 py-3 transition-colors sm:max-w-sm sm:px-3 ${
        invalid ? 'border-red-400' : 'border-border'
      }`}
    >
      <div className="flex items-center justify-between gap-2 px-1 sm:px-0">
        <button
          type="button"
          onClick={() => goMonth(-1)}
          disabled={!canGoPrev}
          aria-label="이전 달"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-fg transition enabled:hover:bg-neutral-100 enabled:active:bg-neutral-200 disabled:opacity-25"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            ‹
          </span>
        </button>
        <p aria-live="polite" className="font-bold text-fg tabular-nums">
          {cursorYear}년 {cursorMonth}월
        </p>
        <button
          type="button"
          onClick={() => goMonth(1)}
          disabled={!canGoNext}
          aria-label="다음 달"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-fg transition enabled:hover:bg-neutral-100 enabled:active:bg-neutral-200 disabled:opacity-25"
        >
          <span aria-hidden="true" className="text-lg leading-none">
            ›
          </span>
        </button>
      </div>

      <table
        ref={gridRef}
        role="grid"
        aria-label={label}
        aria-describedby={describedBy}
        className="mt-1 w-full table-fixed border-separate border-spacing-y-0.5"
      >
        <thead>
          <tr>
            {WEEKDAYS.map((day, i) => (
              <th
                key={day}
                scope="col"
                className={`pb-1 text-xs font-medium text-muted ${WEEKDAY_TONE[i]}`}
              >
                <span aria-hidden="true">{day}</span>
                <span className="sr-only">{day}요일</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week.find(Boolean) ?? String(week.length)}>
              {week.map((date, weekday) => {
                if (!date) return <td key={weekday} />;
                const disabled = date < min || date > max;
                const selected = date === value;
                const isToday = date === today;
                return (
                  <td
                    key={date}
                    role="gridcell"
                    aria-selected={selected}
                    className="p-0 text-center"
                  >
                    <button
                      type="button"
                      // 오류 처리가 포커스를 보내는 대상은 로빙 tabindex 를 가진 한 칸이다.
                      id={date === rovingDate ? id : undefined}
                      data-date={date}
                      tabIndex={date === rovingDate ? 0 : -1}
                      disabled={disabled}
                      onClick={() => {
                        setFocusedDate(date);
                        onChange(date);
                      }}
                      onKeyDown={onKeyDown}
                      aria-current={isToday ? 'date' : undefined}
                      // 스크린리더는 "9월 24일 (수)" 까지 읽어야 요일을 세지 않아도 된다.
                      aria-label={formatVisitDate(date)}
                      className={`relative mx-auto flex h-11 w-full max-w-12 items-center justify-center rounded-xl text-sm tabular-nums transition ease-brand duration-brand-fast ${
                        disabled
                          ? 'cursor-not-allowed text-neutral-300'
                          : selected
                            ? 'bg-brand-600 font-bold text-white'
                            : `font-medium hover:bg-brand-50 active:bg-brand-100 ${
                                WEEKDAY_TONE[weekday] || 'text-fg'
                              }`
                      }`}
                    >
                      {Number(date.slice(8))}
                      {/* 오늘 표시 — 선택된 칸에서는 흰 점으로 바뀌어 배경에 묻히지 않는다. */}
                      {isToday && !selected && (
                        <span
                          aria-hidden="true"
                          className={`absolute bottom-1 h-1 w-1 rounded-full ${
                            disabled ? 'bg-neutral-300' : 'bg-brand-600'
                          }`}
                        />
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
