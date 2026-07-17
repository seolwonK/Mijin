'use client';

import { useMemo, useState } from 'react';
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

const TOP_N = 5;

function won(n: number) {
  return `${n.toLocaleString('ko-KR')}원`;
}

// "결"(C) 카드 관례의 소개 수수료 요약 — partner·tech 대시보드 공용(url만 다르게 넘긴다).
// 평생 한 번도 적립된 적이 없으면 대시보드를 어지럽히지 않도록 아무것도 렌더하지 않는다.
// AC-6: 상위 5건 제한은 UI 전용이었던 것을 "전체 보기" 토글로 해제 + 월별 집계를 추가한다.
// 월별 집계는 이미 받아온 entries(최근 50건)를 클라이언트에서 월 단위로 묶은 것 —
// 신규 원장 API는 물론 기존 partner|tech/commissions 응답도 건드리지 않는다(백엔드 무접촉).
export default function CommissionSummary({ url }: { url: string }) {
  const [showAll, setShowAll] = useState(false);
  const { data } = usePolling<{
    pendingTotal: number;
    paidTotal: number;
    entries: CommissionEntry[];
  }>(url, 30_000);

  const monthly = useMemo(() => {
    if (!data) return [];
    const byMonth = new Map<string, { amount: number; count: number }>();
    for (const e of data.entries) {
      const month = e.createdAt.slice(0, 7); // ISO 문자열 앞 7자 = "YYYY-MM"
      const cur = byMonth.get(month) ?? { amount: 0, count: 0 };
      byMonth.set(month, { amount: cur.amount + e.amount, count: cur.count + 1 });
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0)) // 최신 월 우선
      .map(([month, v]) => ({ month, ...v }));
  }, [data]);

  if (!data || (data.pendingTotal === 0 && data.paidTotal === 0 && data.entries.length === 0)) {
    return null;
  }

  const visibleEntries = showAll ? data.entries : data.entries.slice(0, TOP_N);

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

        {monthly.length > 0 && (
          <div className="mt-3 space-y-1 border-t border-border pt-3">
            <p className="text-xs font-semibold text-muted">월별 집계</p>
            {monthly.map((m) => (
              <div key={m.month} className="flex items-center justify-between text-sm">
                <span className="text-muted">
                  {m.month} ({m.count}건)
                </span>
                <span className="font-semibold text-fg">{won(m.amount)}</span>
              </div>
            ))}
          </div>
        )}

        {data.entries.length > 0 && (
          <>
            <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
              {visibleEntries.map((e) => (
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
            {data.entries.length > TOP_N && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="mt-2 w-full text-center text-xs font-semibold text-brand-700 hover:underline"
              >
                {showAll ? '접기' : `전체 보기 (${data.entries.length}건)`}
              </button>
            )}
          </>
        )}
      </Surface>
    </section>
  );
}
