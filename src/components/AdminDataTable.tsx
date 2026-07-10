'use client';

import { useMemo, useState } from 'react';

// "관제탑"(B) 정렬 가능 데이터 테이블 — admin-* 토큰 전용 프리미티브.
// `tone='dark'`(대시보드, admin-bg 위) / `tone='light'`(providers·technicians 목록 등
// "B-라이트" 화면, 기존 라이트 뉴트럴 배경 위) 둘 다 지원한다. 기존 SortTh.tsx는 이 컴포넌트로
// 대체돼 더 이상 쓰이지 않는다(레인4 admin 11화면 롤아웃에서 정리).
export type SortState<K extends string> = { key: K; dir: 1 | -1 };

export type Column<T, K extends string> = {
  key: K;
  label: string;
  width?: string;
  align?: 'left' | 'right';
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  render: (row: T) => React.ReactNode;
};

const TONE = {
  dark: {
    head: 'border-admin-border bg-admin-surface text-admin-faint',
    headHover: 'hover:text-admin-ink',
    row: 'border-admin-border text-admin-ink',
    rowHover: 'hover:bg-admin-surface',
    rowSelected: 'bg-admin-cyan/10',
    focusRing: 'focus-visible:outline-admin-cyan',
  },
  light: {
    head: 'border-border bg-neutral-50 text-muted',
    headHover: 'hover:text-fg',
    row: 'border-border text-fg',
    rowHover: 'hover:bg-neutral-50',
    rowSelected: 'bg-admin-cyan-ink/10',
    focusRing: 'focus-visible:outline-admin-cyan-ink',
  },
} as const;

export default function AdminDataTable<T, K extends string>({
  columns,
  rows,
  rowKey,
  defaultSort,
  onRowClick,
  selectedKey,
  rowClassName,
  tone = 'dark',
}: {
  columns: Column<T, K>[];
  rows: T[];
  rowKey: (row: T) => string;
  defaultSort?: SortState<K>;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  rowClassName?: (row: T) => string;
  tone?: 'dark' | 'light';
}) {
  const [sort, setSort] = useState<SortState<K> | null>(defaultSort ?? null);
  const t = TONE[tone];

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      // 문자열은 한글 정렬 규칙(localeCompare 'ko')로, 숫자는 수치 비교로 — 문자열 분기를
      // 범용 </>로 처리하면 코드포인트 순이 돼 한글 가나다순이 깨진다.
      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv, 'ko') * sort.dir;
      }
      if (av < bv) return -1 * sort.dir;
      if (av > bv) return 1 * sort.dir;
      return 0;
    });
  }, [rows, sort, columns]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] border-collapse text-[13px]">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className={`sticky top-0 border-b px-3.5 py-2.5 font-mono text-[10px] font-semibold tracking-wide uppercase ${t.head} ${
                  col.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {col.sortable ? (
                  <button
                    type="button"
                    onClick={() =>
                      setSort((s) => ({
                        key: col.key,
                        dir: s?.key === col.key && s.dir === 1 ? -1 : 1,
                      }))
                    }
                    className={`inline-flex items-center gap-1 normal-case ${t.headHover}`}
                  >
                    {col.label}
                    <span className="opacity-70">
                      {sort?.key === col.key ? (sort.dir === 1 ? '▲' : '▼') : '·'}
                    </span>
                  </button>
                ) : (
                  col.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => {
            const key = rowKey(row);
            const selected = selectedKey === key;
            return (
              <tr
                key={key}
                onClick={() => onRowClick?.(row)}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? 'button' : undefined}
                aria-pressed={onRowClick ? selected : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        // 행의 동작은 선택(인스펙터 갱신)이지 페이지 이동이 아니므로 Enter·Space
                        // 둘 다 선택으로 취급한다 — Space는 기본 스크롤 동작을 막아야 한다.
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                className={`border-b ${t.row} ${
                  onRowClick
                    ? `cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 ${t.focusRing}`
                    : ''
                } ${selected ? t.rowSelected : t.rowHover} ${rowClassName?.(row) ?? ''}`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3.5 py-2.5 align-middle ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
