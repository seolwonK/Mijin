'use client';

import Link from 'next/link';
import { usePolling } from '@/components/usePolling';

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
  const all = data?.providers ?? [];
  const pending = all.filter((p) => p.approvalStatus === 'PENDING');
  const approved = all.filter((p) => p.approvalStatus === 'APPROVED');
  const rejected = all.filter((p) => p.approvalStatus === 'REJECTED');

  async function toggleActive(p: ProviderRow) {
    await fetch(`/api/admin/providers/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !p.isActive }),
    });
    await refresh();
  }

  return (
    <main className="min-h-screen">
      <header className="flex items-center gap-3 border-b border-gray-200 p-4">
        <Link href="/admin" className="text-xl">
          ←
        </Link>
        <h1 className="text-lg font-bold">업체 관리</h1>
        <Link
          href="/admin/providers/new"
          className="ml-auto rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-bold text-white"
        >
          + 직접 등록
        </Link>
      </header>

      <div className="space-y-6 p-4">
        {error && <p className="text-sm text-red-600">{error}</p>}

        {pending.length > 0 && (
          <section>
            <h2 className="mb-2 font-semibold text-amber-700">
              🕐 승인 대기 ({pending.length})
            </h2>
            <div className="space-y-2">
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
                  <p className="text-xs text-gray-400">
                    신청 {new Date(p.appliedAt).toLocaleString('ko-KR')}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-2 font-semibold">운영 중 업체 ({approved.length})</h2>
          <div className="space-y-2">
            {approved.map((p) => (
              <div
                key={p.id}
                className={`rounded-2xl border p-4 ${
                  p.isActive
                    ? 'border-gray-200 bg-white'
                    : 'border-gray-200 bg-gray-50 opacity-70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Link href={`/admin/providers/${p.id}`} className="font-bold underline">
                    {p.name}
                  </Link>
                  <button
                    type="button"
                    onClick={() => toggleActive(p)}
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      p.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {p.isActive ? '활성' : '비활성'}
                  </button>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  {p.loginId} · {p.phone}
                </p>
                <p className="text-sm text-gray-500">📍 {p.address}</p>
              </div>
            ))}
            {approved.length === 0 && (
              <p className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-400">
                운영 중인 업체가 없습니다
              </p>
            )}
          </div>
        </section>

        {rejected.length > 0 && (
          <section>
            <h2 className="mb-2 font-semibold text-gray-400">거절된 신청 ({rejected.length})</h2>
            <div className="space-y-2 opacity-60">
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
