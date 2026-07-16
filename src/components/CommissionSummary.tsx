'use client';

import { usePolling } from '@/components/usePolling';
import Surface from '@/components/Surface';

type CommissionEntry = {
  id: string;
  refereeName: string;
  refereeType: '업체' | '기술자' | null;
  amount: number;
  status: 'PENDING' | 'PAID';
  createdAt: string;
};

function won(n: number) {
  return `${n.toLocaleString('ko-KR')}원`;
}

// "결"(C) 카드 관례의 소개 수수료 요약 — partner·tech 대시보드 공용(url만 다르게 넘긴다).
// 평생 한 번도 적립된 적이 없으면 대시보드를 어지럽히지 않도록 아무것도 렌더하지 않는다.
export default function CommissionSummary({ url }: { url: string }) {
  const { data } = usePolling<{
    pendingTotal: number;
    paidTotal: number;
    entries: CommissionEntry[];
  }>(url, 30_000);

  if (!data || (data.pendingTotal === 0 && data.paidTotal === 0 && data.entries.length === 0)) {
    return null;
  }

  return (
    <section>
      <h2 className="mb-2 font-semibold">소개 수수료</h2>
      <Surface as="section" className="rounded-2xl p-4">
        <div className="flex gap-6">
          <div>
            <p className="text-xs text-muted">대기</p>
            <p className="text-lg font-bold text-amber-700">{won(data.pendingTotal)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">지급 완료</p>
            <p className="text-lg font-bold text-muted">{won(data.paidTotal)}</p>
          </div>
        </div>
        {data.entries.length > 0 && (
          <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
            {data.entries.slice(0, 5).map((e) => (
              <li key={e.id} className="flex items-center justify-between text-sm">
                <span className="text-muted">
                  {e.refereeName}
                  {e.refereeType && ` (${e.refereeType})`}
                </span>
                <span
                  className={e.status === 'PENDING' ? 'font-semibold text-amber-700' : 'text-muted'}
                >
                  {won(e.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </section>
  );
}
