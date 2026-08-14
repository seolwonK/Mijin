'use client';

// 내 알 크레딧 카드 (기술자·업체 포털 공용) — 본인 잔액 + 같은 종류 내 순위만 표시.
// 타인의 잔액·순위는 API가 반환하지 않는다(가시성 정책). 폴링 60초.
import { usePolling } from '@/components/usePolling';

type EggRank = { balance: number; rank: number; poolSize: number };

export default function PortalEggCard({ role }: { role: 'tech' | 'partner' }) {
  const { data } = usePolling<EggRank>(`/api/${role}/eggs`, 60_000);
  const kindLabel = role === 'partner' ? '업체' : '기사';
  const unit = role === 'partner' ? '곳' : '명';

  return (
    <section className="rounded-2xl bg-white p-5 shadow-surface-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-muted">내 알</p>
          <p className="mt-0.5 font-mono text-2xl font-bold text-brand-700">
            {data ? `${data.balance}알` : '–'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">배정 노출 순위</p>
          <p className="mt-0.5 font-mono text-sm font-bold text-fg">
            {data ? `${kindLabel} ${data.poolSize}${unit} 중 ${data.rank}위` : '–'}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        알이 많을수록 배정 순위에서 우선 노출되고, 배정을 수락하면 1알이 차감됩니다. 충전은
        관리자에게 문의해 주세요 (최소 3알, 1알 = 1만원).
      </p>
    </section>
  );
}
