'use client';

import { useState } from 'react';
import Link from 'next/link';
import BackButton from '@/components/BackButton';
import { usePolling } from '@/components/usePolling';
import { CardSkeletonGrid } from '@/components/Skeleton';

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
  const all = data?.providers ?? [];
  const loading = !data && !error;
  const pending = all.filter((p) => p.approvalStatus === 'PENDING');
  const approved = all.filter((p) => p.approvalStatus === 'APPROVED');
  const rejected = all.filter((p) => p.approvalStatus === 'REJECTED');

  async function toggleActive(p: ProviderRow) {
    // 비활성 전환은 배정 대상 제외라 실수 방지용 확인
    if (
      p.isActive &&
      !window.confirm(
        `${p.name}을(를) 비활성으로 바꿀까요?\n비활성 업체는 배정 대상에서 제외됩니다.`,
      )
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
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-gray-200 bg-white/95 px-4 py-2 backdrop-blur">
        <BackButton fallback="/admin" />
        <h1 className="text-lg font-bold">업체 관리</h1>
        <Link
          href="/admin/providers/new"
          className="ml-auto rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white active:bg-blue-700"
        >
          + 직접 등록
        </Link>
      </header>

      <div className="space-y-6 p-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {actionError && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">
            {actionError}
          </p>
        )}

        {pending.length > 0 && (
          <section>
            <h2 className="mb-2 font-semibold text-amber-700">
              🕐 승인 대기 ({pending.length})
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
                  <p className="mt-1 text-sm text-gray-600">
                    사업자번호 {p.bizRegNo ?? '-'} · {p.phone}
                  </p>
                  <p className="text-xs text-gray-500">
                    신청 {new Date(p.appliedAt).toLocaleString('ko-KR')}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-2 font-semibold">운영 중 업체 ({approved.length})</h2>
          {loading && <CardSkeletonGrid count={3} />}
          {!loading && approved.length === 0 && (
            <p className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-500">
              운영 중인 업체가 없습니다
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {approved.map((p) => (
              <div
                key={p.id}
                className={`relative rounded-2xl border p-4 transition-colors hover:border-blue-300 hover:shadow-sm ${
                  p.isActive
                    ? 'border-gray-200 bg-white'
                    : 'border-gray-200 bg-gray-50 opacity-70'
                }`}
              >
                <Link
                  href={`/admin/providers/${p.id}`}
                  aria-label={`${p.name} 상세 보기`}
                  className="absolute inset-0 z-[1] rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
                <div className="flex items-center justify-between">
                  <span className="font-bold">{p.name}</span>
                  <button
                    type="button"
                    onClick={() => toggleActive(p)}
                    disabled={togglingId === p.id}
                    className={`relative z-[2] rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${
                      p.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {togglingId === p.id ? '변경 중…' : p.isActive ? '활성' : '비활성'}
                  </button>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  {p.loginId} · {p.phone}
                </p>
                <p className="text-sm text-gray-500">📍 {p.address}</p>
              </div>
            ))}
          </div>
        </section>

        {rejected.length > 0 && (
          <section>
            <h2 className="mb-2 font-semibold text-gray-500">거절된 신청 ({rejected.length})</h2>
            <div className="grid gap-2 opacity-60 sm:grid-cols-2 xl:grid-cols-3">
              {rejected.map((p) => (
                <Link
                  key={p.id}
                  href={`/admin/providers/${p.id}`}
                  className="block rounded-2xl border border-gray-200 bg-gray-50 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{p.name}</span>
                    <span className="rounded-full bg-gray-400 px-2 py-0.5 text-xs font-bold text-white">
                      거절됨
                    </span>
                  </div>
                  {p.rejectReason && (
                    <p className="mt-1 text-xs text-gray-500">사유: {p.rejectReason}</p>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
