'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePolling } from '@/components/usePolling';
import { StatusBadge, UrgencyBadge } from '@/components/StatusBadge';
import LogoutButton from '@/components/LogoutButton';

type RequestRow = {
  id: string;
  lookupCode: string;
  customerName: string;
  customerPhone: string;
  description: string;
  urgency: string;
  status: string;
  address: string | null;
  needsAttention: boolean;
  createdAt: string;
  providerName: string | null;
};

const TABS: { key: string; label: string; statuses: string[] | null }[] = [
  { key: 'ALL', label: '전체', statuses: null },
  { key: 'RECEIVED', label: '배정대기', statuses: ['RECEIVED'] },
  { key: 'ASSIGNED', label: '배정됨', statuses: ['ASSIGNED'] },
  { key: 'ACTIVE', label: '진행중', statuses: ['ACCEPTED', 'DISPATCHED'] },
  { key: 'DONE', label: '완료/취소', statuses: ['COMPLETED', 'CANCELED'] },
];

export default function AdminDashboardPage() {
  const [tab, setTab] = useState('ALL');
  const { data, error } = usePolling<{ requests: RequestRow[] }>(
    '/api/admin/requests',
    8_000,
  );
  // 승인 대기 업체 수 배지용 (심사 요청을 대시보드에서 바로 인지)
  const { data: provData } = usePolling<{
    providers: { approvalStatus: string }[];
  }>('/api/admin/providers', 30_000);
  const pendingProviders = (provData?.providers ?? []).filter(
    (p) => p.approvalStatus === 'PENDING',
  ).length;
  const all = data?.requests ?? [];
  const statuses = TABS.find((t) => t.key === tab)?.statuses ?? null;
  const rows = statuses ? all.filter((r) => statuses.includes(r.status)) : all;

  return (
    <main className="min-h-screen">
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur">
        <header className="border-b border-gray-100 p-4 pb-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold">관리자 대시보드</h1>
            <LogoutButton loginPath="/admin/login" />
          </div>
          <div className="mt-3 flex gap-2">
            <Link
              href="/admin/providers"
              className="relative rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 active:bg-gray-50"
            >
              업체 관리
              {pendingProviders > 0 && (
                <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                  {pendingProviders}
                </span>
              )}
            </Link>
            <Link
              href="/admin/settings"
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 active:bg-gray-50"
            >
              자동배정 설정
            </Link>
          </div>
        </header>

        <div className="scrollbar-none flex gap-1 overflow-x-auto border-b border-gray-200 p-2">
        {TABS.map((t) => {
          const count = t.statuses
            ? all.filter((r) => t.statuses!.includes(r.status)).length
            : all.length;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${
                tab === t.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {t.label} {count > 0 && count}
            </button>
          );
        })}
        </div>
      </div>

      <div className="p-4">
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        {rows.length === 0 && (
          <p className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-400">
            해당하는 접수가 없습니다
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
          <Link
            key={r.id}
            href={`/admin/requests/${r.id}`}
            className={`block rounded-2xl border p-4 ${
              r.needsAttention
                ? 'border-red-400 bg-red-50'
                : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                {r.needsAttention && <span title="관리자 확인 필요">⚠️</span>}
                <UrgencyBadge urgency={r.urgency} />
                <StatusBadge status={r.status} />
              </div>
              <span className="text-xs text-gray-400">#{r.lookupCode}</span>
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-gray-800">{r.description}</p>
            <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
              <span>
                {r.customerName} · {r.customerPhone}
              </span>
              <span>{new Date(r.createdAt).toLocaleString('ko-KR')}</span>
            </div>
            {r.providerName && (
              <p className="mt-1 text-xs font-medium text-blue-600">
                → {r.providerName}
              </p>
            )}
          </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
