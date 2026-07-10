'use client';

import { useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { buttonClasses } from '@/components/Button';
import { usePolling } from '@/components/usePolling';
import { CardSkeletonGrid } from '@/components/Skeleton';
import { useConfirm } from '@/components/useConfirm';
import AdminDataTable, { type Column } from '@/components/AdminDataTable';

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

type Col = 'name' | 'loginId' | 'phone' | 'address' | 'status';

// "관제탑"(B) B-라이트 롤아웃 — 목록은 AdminDataTable(tone="light")로, 승인대기/거절 섹션은
// 정밀한 sharp-radius 카드로 재도색한다. toggleActive 등 데이터 로직은 완전히 동일하게 유지.
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

  const columns: Column<ProviderRow, Col>[] = [
    {
      key: 'name',
      label: '업체명',
      sortable: true,
      sortValue: (p) => p.name,
      render: (p) => (
        <Link href={`/admin/providers/${p.id}`} className="font-bold text-admin-cyan-ink hover:underline">
          {p.name}
        </Link>
      ),
    },
    { key: 'loginId', label: '아이디', width: '160px', render: (p) => <span className="font-mono text-muted">{p.loginId}</span> },
    {
      key: 'phone',
      label: '전화',
      width: '150px',
      sortable: true,
      sortValue: (p) => p.phone,
      render: (p) => <span className="font-mono text-muted">{p.phone}</span>,
    },
    { key: 'address', label: '주소', render: (p) => <span className="truncate text-muted">{p.address}</span> },
    {
      key: 'status',
      label: '상태',
      width: '110px',
      align: 'right',
      render: (p) => (
        <button
          type="button"
          onClick={() => toggleActive(p)}
          disabled={togglingId === p.id}
          className={`rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${
            p.isActive ? 'bg-green-100 text-green-700' : 'bg-neutral-200 text-neutral-600'
          }`}
        >
          {togglingId === p.id ? '변경 중…' : p.isActive ? '활성' : '비활성'}
        </button>
      ),
    },
  ];

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
          <p role="alert" className="rounded-admin-md border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-600">
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
                  className="block rounded-admin-md border border-amber-400 bg-amber-50 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{p.name}</span>
                    <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                      심사 필요
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-sm text-neutral-600">
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
            <p className="rounded-admin-md border border-border bg-neutral-50 p-6 text-center text-sm text-muted">
              운영 중인 업체가 없습니다
            </p>
          )}
          {!loading && approved.length > 0 && (
            <div className="rounded-admin-md border border-border bg-white">
              <AdminDataTable
                tone="light"
                columns={columns}
                rows={approved}
                rowKey={(p) => p.id}
                defaultSort={{ key: 'name', dir: 1 }}
                rowClassName={(p) => (p.isActive ? '' : 'opacity-60')}
              />
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
                  className="block rounded-admin-md border border-border bg-neutral-50 p-4"
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
