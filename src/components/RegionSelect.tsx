'use client';

import { useId } from 'react';
import { REGIONS, hasSigungu } from '@/lib/regions';

export type RegionValue = { sido: string; sigungu: string };

const selectClass =
  'min-h-11 min-w-0 w-full rounded-xl border border-border bg-white p-3 text-base transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 focus:outline-none disabled:bg-neutral-50 disabled:text-neutral-400';

// 시/도 + 시/군/구 2단 선택 (수기 입력 대신 드롭다운)
export default function RegionSelect({
  value,
  onChange,
  idPrefix,
  error,
}: {
  idPrefix?: string;
  error?: string;
  value: RegionValue;
  onChange: (v: RegionValue) => void;
}) {
  const generated = useId();
  const id = idPrefix ?? generated;
  const sigungus = REGIONS[value.sido] ?? [];
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="min-w-0 text-sm font-medium">
        <span className="mb-1 block">주소 시/도</span>
        <select
          id={`${id}-sido`}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          value={value.sido}
          onChange={(e) => onChange({ sido: e.target.value, sigungu: '' })}
          className={selectClass}
        >
          <option value="">시/도 선택</option>
          {Object.keys(REGIONS).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-0 text-sm font-medium">
        <span className="mb-1 block">주소 시/군/구</span>
        <select
          id={`${id}-sigungu`}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          value={value.sigungu}
          onChange={(e) => onChange({ ...value, sigungu: e.target.value })}
          disabled={!value.sido || !hasSigungu(value.sido)}
          className={selectClass}
        >
          <option value="">
            {value.sido && !hasSigungu(value.sido)
              ? '해당 없음'
              : '시/군/구 선택'}
          </option>
          {sigungus.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="col-span-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}
    </div>
  );
}
