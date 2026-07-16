'use client';

import { useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { buttonClasses } from '@/components/Button';
import { usePolling } from '@/components/usePolling';
import { CardSkeletonGrid } from '@/components/Skeleton';
import { useConfirm } from '@/components/useConfirm';
import AdminDataTable, { type Column } from '@/components/AdminDataTable';
import { StarIcon } from '@/components/icons';

type ReferrerRow = {
  userId: string;
  name: string;
  phone: string;
  type: '업체' | '기술자';
  isActive: boolean;
  approvalStatus: string | null;
  pendingTotal: number;
  pendingCount: number;
  paidTotal: number;
};

type EntryRow = {
  id: string;
  refereeName: string;
  refereeType: '업체' | '기술자' | null;
  requestId: string;
  baseAmount: number;
  amount: number;
  status: 'PENDING' | 'PAID';
  createdAt: string;
  paidAt: string | null;
  rating: number | null;
  commentPreview: string | null;
  isHighAmount: boolean;
};

function won(n: number) {
  return `${n.toLocaleString('ko-KR')}원`;
}

type RefCol = 'name' | 'pending' | 'count' | 'paid';

// "관제탑"(B) 정산 화면 — 소개자별 요약(AdminDataTable) 행을 선택하면 아래에 건별 내역을
// lazy 로드한다(평생 적립 대비 최근 100건 + 더보기 cursor). 지급 전 검토 게이트로 별점·후기·
// 고액 하이라이트를 건별 목록에 노출한다(F3×수수료 담합 벡터 완화, 계획 v3 리스크 표).
export default function AdminCommissionsPage() {
  const { data, error, refresh } = usePolling<{ referrers: ReferrerRow[] }>(
    '/api/admin/commissions',
    15_000,
  );
  const referrers = data?.referrers ?? [];
  const loading = !data && !error;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [paying, setPaying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirm, confirmUI] = useConfirm();

  async function loadEntries(referrerUserId: string, cursor?: string) {
    setEntriesLoading(true);
    try {
      const qs = new URLSearchParams({ referrerUserId });
      if (cursor) qs.set('cursor', cursor);
      const res = await fetch(`/api/admin/commissions?${qs}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('불러오기 실패');
      const json = (await res.json()) as { entries: EntryRow[]; nextCursor: string | null };
      setEntries((prev) => (cursor ? [...prev, ...json.entries] : json.entries));
      setNextCursor(json.nextCursor);
    } catch {
      setActionError('내역을 불러오지 못했습니다');
    } finally {
      setEntriesLoading(false);
    }
  }

  function selectReferrer(userId: string) {
    setSelectedId(userId);
    setChecked(new Set());
    setActionError(null);
    setEntries([]);
    setNextCursor(null);
    loadEntries(userId);
  }

  function toggleCheck(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function pay(body: { entryIds: string[] } | { referrerUserId: string }) {
    setPaying(true);
    setActionError(null);
    try {
      const res = await fetch('/api/admin/commissions/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setActionError((j as { error?: string }).error ?? '지급 처리에 실패했습니다');
        return;
      }
      await refresh();
      if (selectedId) await loadEntries(selectedId);
      setChecked(new Set());
    } catch {
      setActionError('네트워크 오류가 발생했습니다');
    } finally {
      setPaying(false);
    }
  }

  async function paySelected() {
    if (
      !(await confirm({
        title: '지급 완료 처리',
        message: `선택한 ${checked.size}건을 지급 완료로 처리할까요?`,
        confirmText: '지급 완료',
      }))
    )
      return;
    await pay({ entryIds: [...checked] });
  }

  async function payAll(r: ReferrerRow) {
    if (
      !(await confirm({
        title: '전액 지급 완료',
        message: `${r.name}의 미지급 ${won(r.pendingTotal)} 전액을 지급 완료로 처리할까요?`,
        confirmText: '지급 완료',
      }))
    )
      return;
    await pay({ referrerUserId: r.userId });
  }

  const selected = referrers.find((r) => r.userId === selectedId) ?? null;

  const columns: Column<ReferrerRow, RefCol>[] = [
    {
      key: 'name',
      label: '소개자',
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => (
        <span className="flex flex-wrap items-center gap-1.5 font-bold text-fg">
          {r.name}
          <span className="font-normal text-muted">({r.type})</span>
          {!r.isActive && (
            <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-bold text-neutral-600">
              비활성
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'pending',
      label: '미지급 합계',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.pendingTotal,
      render: (r) => (
        <span className={r.pendingTotal > 0 ? 'font-bold text-amber-700' : 'text-muted'}>
          {won(r.pendingTotal)}
        </span>
      ),
    },
    {
      key: 'count',
      label: '건수',
      align: 'right',
      width: '80px',
      render: (r) => <span className="text-muted">{r.pendingCount}건</span>,
    },
    {
      key: 'paid',
      label: '지급 누계',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.paidTotal,
      render: (r) => <span className="text-muted">{won(r.paidTotal)}</span>,
    },
  ];

  return (
    <main className="min-h-screen">
      <div className="md:hidden">
        <PageHeader title="정산" back="/admin" width="max-w-none" />
      </div>
      <div className="hidden items-center justify-between border-b border-border px-4 py-1.5 md:flex">
        <h1 className="text-sm font-bold text-fg">정산</h1>
      </div>

      <div className="space-y-4 px-4 pt-2 pb-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {actionError && (
          <p
            role="alert"
            className="rounded-admin-md border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-600"
          >
            {actionError}
          </p>
        )}

        {loading && <CardSkeletonGrid count={3} />}
        {!loading && referrers.length === 0 && (
          <p className="rounded-admin-md border border-border bg-neutral-50 p-6 text-center text-sm text-muted">
            적립된 수수료가 없습니다
          </p>
        )}
        {!loading && referrers.length > 0 && (
          <div className="rounded-admin-md border border-border bg-white">
            <AdminDataTable
              tone="light"
              columns={columns}
              rows={referrers}
              rowKey={(r) => r.userId}
              defaultSort={{ key: 'pending', dir: -1 }}
              onRowClick={(r) => selectReferrer(r.userId)}
              selectedKey={selectedId}
            />
          </div>
        )}

        {selected && (
          <section className="rounded-admin-md border border-border bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
              <h2 className="text-sm font-bold text-fg">
                {selected.name} 내역{' '}
                <span className="font-normal text-muted">· 미지급 {won(selected.pendingTotal)}</span>
              </h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={checked.size === 0 || paying}
                  onClick={paySelected}
                  className={buttonClasses('secondary', 'sm')}
                >
                  선택 지급 ({checked.size})
                </button>
                <button
                  type="button"
                  disabled={selected.pendingTotal === 0 || paying}
                  onClick={() => payAll(selected)}
                  className={buttonClasses('primary', 'sm')}
                >
                  전액 지급 완료
                </button>
              </div>
            </div>

            <ul className="divide-y divide-border">
              {entries.map((e) => (
                <li
                  key={e.id}
                  className={`flex items-start gap-3 p-3 text-sm ${e.isHighAmount ? 'bg-amber-50' : ''}`}
                >
                  {e.status === 'PENDING' ? (
                    <input
                      type="checkbox"
                      checked={checked.has(e.id)}
                      onChange={() => toggleCheck(e.id)}
                      aria-label={`${e.refereeName} 수수료 ${won(e.amount)} 선택`}
                      className="mt-1 h-4 w-4 shrink-0"
                    />
                  ) : (
                    <span className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-fg">
                        {e.refereeName}
                        <span className="ml-1 font-normal text-muted">({e.refereeType ?? '-'})</span>
                        {e.isHighAmount && (
                          <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                            고액
                          </span>
                        )}
                      </span>
                      <span className={`font-bold ${e.status === 'PAID' ? 'text-muted' : 'text-amber-700'}`}>
                        {won(e.amount)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      결제 {won(e.baseAmount)} · {new Date(e.createdAt).toLocaleString('ko-KR')}
                      {e.status === 'PAID' &&
                        e.paidAt &&
                        ` · 지급 ${new Date(e.paidAt).toLocaleDateString('ko-KR')}`}
                    </p>
                    {e.rating != null && (
                      <div className="mt-1 flex min-w-0 items-center gap-2">
                        <span className="inline-flex shrink-0 items-center gap-0.5 text-amber-500">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <StarIcon key={n} filled={n <= e.rating!} className="h-3.5 w-3.5" />
                          ))}
                        </span>
                        {e.commentPreview && (
                          <span className="truncate text-xs text-muted">{e.commentPreview}</span>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              ))}
              {entries.length === 0 && !entriesLoading && (
                <li className="p-6 text-center text-sm text-muted">내역이 없습니다</li>
              )}
            </ul>

            {entriesLoading && <p className="p-3 text-center text-xs text-muted">불러오는 중…</p>}
            {nextCursor && !entriesLoading && (
              <button
                type="button"
                onClick={() => loadEntries(selected.userId, nextCursor)}
                className="w-full border-t border-border p-2.5 text-xs font-semibold text-admin-cyan-ink hover:bg-neutral-50"
              >
                더보기
              </button>
            )}
          </section>
        )}
      </div>
      {confirmUI}
    </main>
  );
}
