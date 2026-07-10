// "관제탑"(B) 상단 메트릭 스트립 — 관리자 대시보드의 오늘 현황 요약 행.
export type Metric = {
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'warn' | 'accent';
  sub?: string;
};

export default function AdminMetricStrip({ metrics }: { metrics: Metric[] }) {
  return (
    <div
      className="grid border-b border-admin-border bg-admin-bg text-admin-ink"
      style={{ gridTemplateColumns: `repeat(${metrics.length}, minmax(0, 1fr))` }}
    >
      {metrics.map((m, i) => (
        <div
          key={m.label}
          className={`px-5 py-3 ${i < metrics.length - 1 ? 'border-r border-admin-border' : ''}`}
        >
          <p className="font-mono text-[10px] tracking-wide text-admin-faint uppercase">
            {m.label}
          </p>
          <p
            className={`mt-1 font-mono text-[22px] font-bold ${
              m.tone === 'warn'
                ? 'text-admin-red'
                : m.tone === 'accent'
                  ? 'text-admin-cyan'
                  : ''
            }`}
          >
            {m.value}
          </p>
          {m.sub && <p className="mt-0.5 text-[10.5px] text-admin-dim">{m.sub}</p>}
        </div>
      ))}
    </div>
  );
}
