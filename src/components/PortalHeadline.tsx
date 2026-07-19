import type { CommissionSummaryData } from '@/components/CommissionSummary';
import type { PortalStats } from '@/components/PortalStatsCard';

// 수익·성과 헤드라인 스트립 — 정직 수치 원칙: 서버 정확 집계 필드만, 로딩 시 0 대신 —.
// 390px에서 3지표가 한 줄에 안 들어가 가로 스크롤/잘림이 났던 것을 3열 그리드(라벨 위·값 아래)로
// 해결한다(AC-V3: 줄바꿈·자리 흔들림 없음, tabular-nums).
type PortalHeadlineProps = {
  stats: PortalStats | null;
  commission: CommissionSummaryData | null;
};

function won(value: number) {
  return `₩${value.toLocaleString('ko-KR')}`;
}

const METRIC_LABEL = 'font-mono text-[11px] tracking-wide text-muted uppercase';
const METRIC_VALUE = 'text-xl font-extrabold tabular-nums leading-none text-fg sm:text-2xl';

export default function PortalHeadline({ stats, commission }: PortalHeadlineProps) {
  return (
    <section aria-label="포털 요약" className="grid grid-cols-3 divide-x divide-border rounded-2xl bg-white py-3 shadow-surface-sm">
      <div className="space-y-1 px-3 text-center">
        <p className={METRIC_LABEL}>30일 수락</p>
        <p className={METRIC_VALUE}>{stats ? `${stats.accepted30d}건` : '—'}</p>
      </div>
      <div className="space-y-1 px-3 text-center">
        <p className={METRIC_LABEL}>적립 대기</p>
        <p className={METRIC_VALUE}>{commission ? won(commission.pendingTotal) : '—'}</p>
      </div>
      <div className="space-y-1 px-3 text-center">
        <p className={METRIC_LABEL}>지급 완료</p>
        <p className={METRIC_VALUE}>{commission ? won(commission.paidTotal) : '—'}</p>
      </div>
    </section>
  );
}
