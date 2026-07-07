'use client';

import { REGIONS, hasSigungu } from '@/lib/regions';

export type RegionValue = { sido: string; sigungu: string };

const selectClass =
  'w-full appearance-none rounded-xl border border-gray-300 bg-white p-3 text-base focus:border-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400';

// 시/도 + 시/군/구 2단 선택 (수기 입력 대신 드롭다운)
export default function RegionSelect({
  value,
  onChange,
}: {
  value: RegionValue;
  onChange: (v: RegionValue) => void;
}) {
  const sigungus = REGIONS[value.sido] ?? [];
  return (
    <div className="grid grid-cols-2 gap-2">
      <select
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
      <select
        value={value.sigungu}
        onChange={(e) => onChange({ ...value, sigungu: e.target.value })}
        disabled={!value.sido || !hasSigungu(value.sido)}
        className={selectClass}
      >
        <option value="">
          {value.sido && !hasSigungu(value.sido) ? '해당 없음' : '시/군/구 선택'}
        </option>
        {sigungus.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
    </div>
  );
}
