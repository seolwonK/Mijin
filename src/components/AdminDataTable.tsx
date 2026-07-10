'use client';

import { useMemo, useState } from 'react';

// "관제탑"(B) 정렬 가능 데이터 테이블 — admin-* 다크 토큰 전용 프리미티브.
// 기존 SortTh.tsx(라이트 톤, admin/providers·technicians가 계속 사용)와 별개로 둔다 —
// 다크 배경에서 대비가 맞아야 하고, 행 클릭(onRowClick)으로 우측 인스펙터와 연동해야 해서
// 헤더 하나만 다크로 재도색하는 것보다 테이블 전체를 하나의 프리미티브로 묶는 편이 안전하다.
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

export default function AdminDataTable<T, K extends string>({
  columns,
  rows,
  rowKey,
  defaultSort,
  onRowClick,
  selectedKey,
  rowClassName,
}: {
  columns: Column<T, K>[];
  rows: T[];
  rowKey: (row: T) => string;
  defaultSort?: SortState<K>;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  rowClassName?: (row: T) => string;
}) {
  const [sort, setSort] = useState<SortState<K> | null>(defaultSort ?? null);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
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
                className={`sticky top-0 border-b border-admin-border bg-admin-surface px-3.5 py-2.5 font-mono text-[10px] font-semibold tracking-wide text-admin-faint uppercase ${
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
                    className="inline-flex items-center gap-1 normal-case hover:text-admin-ink"
                  >
                    {col.label}
                    <span className="text-admin-faint">
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
                className={`border-b border-admin-border text-admin-ink ${
                  onRowClick ? 'cursor-pointer' : ''
                } ${selected ? 'bg-admin-cyan/10' : 'hover:bg-admin-surface'} ${rowClassName?.(row) ?? ''}`}
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
