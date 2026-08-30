import Link from 'next/link';

// "관제탑"(B) 상단 메트릭 스트립 — 관리자 대시보드의 오늘 현황 요약 행.
// 파일럿 리스타일(Stripe 메셀러리): 숫자에 맥락을 붙인다 — 증감/주의 델타 칩과
// 시간대별 미니 스파크라인. 스파크는 호출측이 실데이터로 계산해 넘긴다(가공 수치 금지).
export type Metric = {
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'warn' | 'accent';
  sub?: string;
  /* 값 옆 상태 칩 — sub보다 강한 주의 신호(예: "확인 2"). */
  delta?: { label: string; tone: 'warn' | 'ok' };
  /* 시간대별 건수 등 실측 추이. 마지막 항목이 현재 구간으로 강조된다. */
  spark?: number[];
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

const DELTA_COLOR = {
  warn: 'bg-amber-50 text-amber-700',
  ok: 'bg-emerald-50 text-emerald-700',
} as const;

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <span className="ml-auto hidden h-6 items-end gap-0.5 self-end xl:flex" aria-hidden>
      {data.map((v, i) => (
        <span
          key={i}
          className={`w-[5px] rounded-t-[1px] ${i === data.length - 1 ? 'bg-brand-600' : 'bg-neutral-300'}`}
          style={{ height: `${Math.max(3, Math.round((v / max) * 24))}px` }}
        />
      ))}
    </span>
  );
}

export default function AdminMetricStrip({ metrics }: { metrics: Metric[] }) {
  return (
    <div
      className="grid grid-cols-4 bg-white text-fg lg:[grid-template-columns:repeat(var(--metric-count),minmax(0,1fr))]"
      style={{ '--metric-count': metrics.length } as React.CSSProperties}
    >
      {metrics.map((m, i) => {
        const content = (
          <>
            <p className="font-mono text-xs tracking-wide text-muted uppercase">
              {m.label}
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <p
                className={`font-mono text-2xl font-bold ${VALUE_COLOR[m.tone ?? 'default']}`}
              >
                {m.value}
              </p>
              {m.delta && (
                <span
                  className={`rounded-admin-sm px-1.5 py-0.5 text-xs font-bold ${DELTA_COLOR[m.delta.tone]}`}
                >
                  {m.delta.label}
                </span>
              )}
              {m.spark && m.spark.length > 1 && <Sparkline data={m.spark} />}
            </div>
            {m.sub && (
              <p className="mt-0.5 text-xs text-muted">
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
              className={`${className} transition-colors duration-brand-fast ease-portal hover:bg-neutral-50`}
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
            className={`${className} text-left transition-colors duration-brand-fast ease-portal hover:bg-neutral-50`}
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
