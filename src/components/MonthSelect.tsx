'use client';

import { KST_OFFSET_MS } from '@/lib/kst';

// 네이티브 <input type="month">는 브라우저 UI 언어를 따라 "August 2026"처럼
// 영문으로 표시될 수 있어, 한국어 고정 표기가 필요한 화면에서는 셀렉트로 대체한다.

function currentKstMonth() {
  const kst = new Date(Date.now() + KST_OFFSET_MS);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function recentMonths(count: number) {
  const [year, month] = currentKstMonth().split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const total = year * 12 + (month - 1) - i;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
  });
}

export default function MonthSelect({
  value,
  onChange,
  allowAll = false,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  allowAll?: boolean;
  ariaLabel: string;
  className?: string;
}) {
  const options = recentMonths(18);
  if (value && !options.includes(value)) {
    options.push(value);
    options.sort().reverse();
  }
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={ariaLabel}
      className={className}
    >
      {allowAll && <option value="">전체 기간</option>}
      {options.map((month) => {
        const [y, m] = month.split('-');
        return (
          <option key={month} value={month}>
            {y}년 {Number(m)}월
          </option>
        );
      })}
    </select>
  );
}
