'use client';
import Link from 'next/link';
import Surface from '@/components/Surface';
export type CommissionEntry = {
  id: string;
  refereeName: string;
  refereeType: '업체' | '전기기사' | null;
  amount: number;
  status: 'PENDING' | 'PAID';
  createdAt: string;
};
export type CommissionSummaryData = {
  pendingTotal: number;
  paidTotal: number;
  entries: CommissionEntry[];
  totalCount: number;
  nextCursor: string | null;
};
export function CommissionEntries({ entries }: { entries: CommissionEntry[] }) {
  return (
    <ul className="divide-y divide-border">
      {entries.map((e) => (
        <li key={e.id} className="grid gap-x-4 gap-y-1 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <p className="font-semibold">
              {e.refereeName}
              {e.refereeType && <span className="whitespace-nowrap"> ({e.refereeType})</span>}
            </p>
            <time className="text-muted" dateTime={e.createdAt}>
              {new Date(e.createdAt).toLocaleDateString('ko-KR')} 적립
            </time>
          </div>
          <div className="sm:text-right">
            <p className="font-semibold tabular-nums">
              {e.amount.toLocaleString('ko-KR')}원
            </p>
            <span
              className={
                e.status === 'PENDING' ? 'text-amber-800' : 'text-emerald-800'
              }
            >
              {e.status === 'PENDING' ? '지급 대기' : '지급 완료'}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
export default function CommissionSummary({
  data,
  scope,
}: {
  data: CommissionSummaryData | null;
  scope?: 'partner' | 'tech';
}) {
  if (!data) return null;
  return (
    <section>
      <h2 className="mb-2 font-semibold">소개 수수료</h2>
      <Surface className="rounded-2xl p-4">
        <dl className="grid gap-4 sm:grid-cols-2">
          {[
            ['지급 대기', data.pendingTotal],
            ['지급 완료', data.paidTotal],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-muted">{label} · 전체 기간</dt>
              <dd className="mt-1 break-all text-2xl font-bold tabular-nums">
                {Number(value).toLocaleString('ko-KR')}원
              </dd>
            </div>
          ))}
        </dl>
        {data.entries.length ? (
          <div className="mt-4 border-t border-border">
            <p className="mt-3 text-sm font-semibold">최근 적립 내역</p>
            <CommissionEntries entries={data.entries.slice(0, 5)} />
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">
            아직 적립된 소개 수수료가 없습니다.
          </p>
        )}
        {scope && (
          <Link
            href={`/${scope}/commissions`}
            className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 underline underline-offset-4"
          >
            수수료 전체 내역 ({data.totalCount}건)
          </Link>
        )}
      </Surface>
    </section>
  );
}
