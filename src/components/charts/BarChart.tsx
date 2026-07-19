'use client';

import { useState } from 'react';

type Bar = {
  label: string;
  value: number;
};

export default function BarChart({ data, label }: { data: Bar[]; label: string }) {
  const [selected, setSelected] = useState<number | null>(null);
  const max = Math.max(...data.map((bar) => bar.value), 1);

  if (data.length === 0) {
    return <p className="flex h-56 items-center justify-center text-sm text-muted">표시할 상태 데이터가 없습니다.</p>;
  }

  return (
    <div className="space-y-3" role="img" aria-label={label} onMouseLeave={() => setSelected(null)}>
      {data.map((bar, index) => (
        <div key={bar.label} className="relative" onMouseEnter={() => setSelected(index)}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="text-neutral-600">{bar.label}</span>
            <span className="font-mono font-semibold text-fg">{bar.value}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${(bar.value / max) * 100}%` }} />
          </div>
          {selected === index && <span className="absolute right-0 -top-5 rounded-admin-sm bg-fg px-1.5 py-0.5 text-[11px] text-white">{bar.value}건</span>}
        </div>
      ))}
    </div>
  );
}
