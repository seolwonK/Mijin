import Link from 'next/link';

// "관제탑"(B) 상단 메트릭 스트립 — 관리자 대시보드의 오늘 현황 요약 행.
export type Metric = {
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'warn' | 'accent';
  sub?: string;
  href?: string;
  className?: string;
  onClick?: () => void;
  ariaLabel?: string;
};

const VALUE_COLOR = {
  default: '',
  warn: 'text-red-600',
  accent: 'text-admin-cyan-ink',
} as const;

export default function AdminMetricStrip({ metrics }: { metrics: Metric[] }) {
  return (
    <div
      className="grid grid-cols-4 bg-white text-fg lg:[grid-template-columns:repeat(var(--metric-count),minmax(0,1fr))]"
      style={{ '--metric-count': metrics.length } as React.CSSProperties}
    >
      {metrics.map((m, i) => {
        const content = (
          <>
            <p className="font-mono text-[10px] tracking-wide text-muted uppercase md:text-[11px]">
              {m.label}
            </p>
            <p
              className={`mt-1 font-mono text-[22px] font-bold ${VALUE_COLOR[m.tone ?? 'default']}`}
            >
              {m.value}
            </p>
            {m.sub && (
              <p className="mt-0.5 text-[10.5px] text-muted">
                {m.sub}
              </p>
            )}
          </>
        );
        const className = `px-5 py-3 ${i < metrics.length - 1 ? 'border-r border-border' : ''} ${m.className ?? ''}`;

        if (m.href) {
          return (
            <Link
              key={m.label}
              href={m.href}
              className={`${className} transition-colors hover:bg-neutral-50`}
            >
              {content}
            </Link>
          );
        }

        return m.onClick ? (
          <button
            key={m.label}
            type="button"
            onClick={m.onClick}
            aria-label={m.ariaLabel}
            className={`${className} text-left transition-colors hover:bg-neutral-50`}
          >
            {content}
          </button>
        ) : (
          <div key={m.label} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
