'use client';

import { useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { buttonClasses } from '@/components/Button';
import { cardClasses } from '@/components/Card';
import { usePolling } from '@/components/usePolling';
import { CardSkeletonGrid } from '@/components/Skeleton';
import { SortTh, type SortState } from '@/components/SortTh';
import { useConfirm } from '@/components/useConfirm';

type ProviderRow = {
  id: string;
  loginId: string;
  name: string;
  phone: string;
  address: string;
  isActive: boolean;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  bizRegNo: string | null;
  appliedAt: string;
  rejectReason: string | null;
};

export default function AdminProvidersPage() {
  const { data, error, refresh } = usePolling<{ providers: ProviderRow[] }>(
    '/api/admin/providers',
    15_000,
  );
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirm, confirmUI] = useConfirm();
  const all = data?.providers ?? [];
  const loading = !data && !error;
  const pending = all.filter((p) => p.approvalStatus === 'PENDING');
  const approved = all.filter((p) => p.approvalStatus === 'APPROVED');
  const rejected = all.filter((p) => p.approvalStatus === 'REJECTED');
  const [sort, setSort] = useState<SortState<'name' | 'phone'>>({ key: 'name', dir: 1 });
  const sortedApproved = [...approved].sort(
    (a, b) =>
      (sort.key === 'name'
        ? a.name.localeCompare(b.name, 'ko')
        : a.phone.localeCompare(b.phone, 'ko')) * sort.dir,
  );

  async function toggleActive(p: ProviderRow) {
    // 비활성 전환은 배정 대상 제외라 실수 방지용 확인
    if (
      p.isActive &&
      !(await confirm({
        title: '업체 비활성',
        message: `${p.name}을(를) 비활성으로 바꿀까요?\n비활성 업체는 배정 대상에서 제외됩니다.`,
        confirmText: '비활성으로',
        danger: true,
      }))
    )
      return;
    setTogglingId(p.id);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/providers/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !p.isActive }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(
          (data as { error?: string }).error ?? '상태 변경에 실패했습니다',
        );
        return;
      }
      await refresh();
    } catch {
      setActionError('네트워크 오류가 발생했습니다');
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <main className="min-h-screen">
      <PageHeader
        title="업체 관리"
        back="/admin"
        width="max-w-none"
        right={
          <Link href="/admin/providers/new" className={buttonClasses('primary', 'sm')}>
            + 직접 등록
          </Link>
        }
      />

      <div className="space-y-6 p-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {actionError && (
          <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-600">
            {actionError}
          </p>
        )}

        {pending.length > 0 && (
          <section>
            <h2 className="mb-2 text-base font-bold text-amber-700">
              승인 대기 ({pending.length})
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {pending.map((p) => (
                <Link
                  key={p.id}
                  href={`/admin/providers/${p.id}`}
                  className="block rounded-2xl border border-amber-400 bg-amber-50 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{p.name}</span>
                    <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                      심사 필요
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-neutral-600">
                    사업자번호 {p.bizRegNo ?? '-'} · {p.phone}
                  </p>
                  <p className="text-xs text-muted">
                    신청 {new Date(p.appliedAt).toLocaleString('ko-KR')}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-base font-bold text-fg">
            운영 중 업체 <span className="font-normal text-muted">({approved.length})</span>
          </h2>
          {loading && <CardSkeletonGrid count={3} />}
          {!loading && approved.length === 0 && (
            <p className="rounded-xl border border-border bg-neutral-50 p-6 text-center text-sm text-muted">
              운영 중인 업체가 없습니다
            </p>
          )}
          {!loading && approved.length > 0 && (
            <div className={cardClasses('overflow-x-auto rounded-2xl')}>
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-neutral-50 text-left text-xs tracking-wide text-muted">
                    <SortTh label="업체명" col="name" sort={sort} onSort={setSort} />
                    <th className="px-4 py-2.5 font-semibold">아이디</th>
                    <SortTh label="전화" col="phone" sort={sort} onSort={setSort} />
                    <th className="px-4 py-2.5 font-semibold">주소</th>
                    <th className="px-4 py-2.5 text-right font-semibold">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedApproved.map((p) => (
                    <tr
                      key={p.id}
                      className={`border-b border-border/60 last:border-0 hover:bg-brand-50/50 ${
                        p.isActive ? '' : 'opacity-60'
                      }`}
                    >
                      <td className="px-4 py-2.5 font-bold">
                        <Link href={`/admin/providers/${p.id}`} className="text-brand-700 hover:underline">
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-neutral-600">{p.loginId}</td>
                      <td className="px-4 py-2.5 text-neutral-600">{p.phone}</td>
                      <td className="max-w-xs truncate px-4 py-2.5 text-neutral-600">{p.address}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => toggleActive(p)}
                          disabled={togglingId === p.id}
                          className={`rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${
                            p.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-neutral-200 text-neutral-600'
                          }`}
                        >
                          {togglingId === p.id ? '변경 중…' : p.isActive ? '활성' : '비활성'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {rejected.length > 0 && (
          <section>
            <h2 className="mb-2 text-base font-bold text-muted">거절된 신청 ({rejected.length})</h2>
            <div className="grid gap-2 opacity-60 sm:grid-cols-2 xl:grid-cols-3">
              {rejected.map((p) => (
                <Link
                  key={p.id}
                  href={`/admin/providers/${p.id}`}
                  className="block rounded-2xl border border-border bg-neutral-50 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{p.name}</span>
                    <span className="rounded-full bg-neutral-400 px-2 py-0.5 text-xs font-bold text-white">
                      거절됨
                    </span>
                  </div>
                  {p.rejectReason && (
                    <p className="mt-1 text-xs text-muted">사유: {p.rejectReason}</p>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
      {confirmUI}
    </main>
  );
}
