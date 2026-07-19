'use client';

import { area, line } from 'd3-shape';
import { useState } from 'react';

type Point = {
  label: string;
  value: number;
};

export default function LineChart({ data, label, formatValue = (value: number) => `${value}건`, domain }: { data: Point[]; label: string; formatValue?: (value: number) => string; domain?: [number, number] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const width = 640;
  const height = 220;
  const margin = { top: 18, right: 18, bottom: 36, left: 38 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const [min, max] = domain ?? [0, Math.max(...data.map((point) => point.value), 1)];
  const x = (index: number) => margin.left + (data.length <= 1 ? innerWidth / 2 : (index / (data.length - 1)) * innerWidth);
  const y = (value: number) => margin.top + innerHeight - ((value - min) / (max - min)) * innerHeight;
  const path = line<Point>().x((_, index) => x(index)).y((point) => y(point.value))(data);
  const fill = area<Point>().x((_, index) => x(index)).y0(margin.top + innerHeight).y1((point) => y(point.value))(data);
  const active = selected == null ? null : data[selected];

  if (data.length === 0) {
    return <p className="flex h-56 items-center justify-center text-sm text-muted">표시할 추이 데이터가 없습니다.</p>;
  }

  return (
    <div className="relative" onMouseLeave={() => setSelected(null)}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="h-56 w-full overflow-visible">
        {[0, 0.5, 1].map((step) => {
          const value = min + (max - min) * step;
          const lineY = y(value);
          return <g key={step}><line x1={margin.left} x2={width - margin.right} y1={lineY} y2={lineY} className="stroke-border" strokeDasharray="3 3" /><text x={margin.left - 7} y={lineY + 4} textAnchor="end" className="fill-muted text-[10px]">{formatValue(value)}</text></g>;
        })}
        <path d={fill ?? undefined} className="fill-brand-50" />
        <path d={path ?? undefined} fill="none" className="stroke-brand-600" strokeWidth="2" />
        {data.map((point, index) => (
          <g key={point.label} onMouseEnter={() => setSelected(index)} className="cursor-default">
            <circle cx={x(index)} cy={y(point.value)} r={selected === index ? 4.5 : 3} className="fill-brand-600 stroke-white" strokeWidth="2" />
            <text x={x(index)} y={height - 12} textAnchor="middle" className="fill-muted text-[10px]">{point.label.slice(5)}</text>
          </g>
        ))}
      </svg>
      {active && selected != null && (
        <div className="pointer-events-none absolute rounded-admin-sm border border-border bg-white px-2 py-1 text-xs shadow-card" style={{ left: `${(x(selected) / width) * 100}%`, top: 4, transform: 'translateX(-50%)' }}>
          <span className="font-mono text-muted">{active.label}</span> <strong>{formatValue(active.value)}</strong>
        </div>
      )}
    </div>
  );
}
