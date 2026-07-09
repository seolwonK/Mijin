'use client';

import { useState } from 'react';
import { REGIONS, hasSigungu, regionKey, regionLabel } from '@/lib/regions';

const selectClass =
  'w-full appearance-none rounded-xl border border-border bg-white p-3 text-base focus:border-brand-500 focus:outline-none disabled:bg-neutral-50 disabled:text-neutral-400';

// 서비스 가능 지역을 여러 개 담는 선택기. 시/도만 고르면 "시/도 전체", 시/군/구까지
// 고르면 해당 구만 추가된다. 선택 목록은 상위에서 문자열 키 배열로 관리한다.
export default function RegionMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [sido, setSido] = useState('');
  const [sigungu, setSigungu] = useState('');
  const sigungus = REGIONS[sido] ?? [];

  function add() {
    if (!sido) return;
    const key = regionKey(sido, sigungu);
    if (!value.includes(key)) onChange([...value, key]);
    setSigungu('');
  }

  function remove(key: string) {
    onChange(value.filter((k) => k !== key));
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <select
          value={sido}
          onChange={(e) => {
            setSido(e.target.value);
            setSigungu('');
          }}
          className={selectClass}
        >
          <option value="">시/도</option>
          {Object.keys(REGIONS).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={sigungu}
          onChange={(e) => setSigungu(e.target.value)}
          disabled={!sido || !hasSigungu(sido)}
          className={selectClass}
        >
          <option value="">{sido && hasSigungu(sido) ? '전체' : '해당 없음'}</option>
          {sigungus.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={add}
          disabled={!sido}
          className="shrink-0 rounded-xl bg-neutral-900 px-4 text-sm font-bold text-white transition-colors enabled:hover:bg-neutral-950 disabled:opacity-50"
        >
          추가
        </button>
      </div>

      {value.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {value.map((key) => (
            <span
              key={key}
              className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-3 pr-1 text-sm font-medium text-brand-700"
            >
              {regionLabel(key)}
              <button
                type="button"
                onClick={() => remove(key)}
                aria-label={`${regionLabel(key)} 삭제`}
                className="flex h-5 w-5 items-center justify-center rounded-full text-brand-400 hover:bg-brand-100 hover:text-brand-700"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-neutral-400">
          선택하지 않으면 <b>전 지역</b>의 요청을 받습니다.
        </p>
      )}
    </div>
  );
}
