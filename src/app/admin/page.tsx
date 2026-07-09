'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePolling } from '@/components/usePolling';
import { StatusBadge, UrgencyBadge } from '@/components/StatusBadge';
import LogoutButton from '@/components/LogoutButton';
import { CardSkeleton } from '@/components/Skeleton';

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
  assigneeName: string | null;
  assigneeKind: 'PROVIDER' | 'TECHNICIAN' | null;
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
  const [q, setQ] = useState('');
  const { data, error } = usePolling<{ requests: RequestRow[] }>(
    '/api/admin/requests',
    8_000,
  );
  // 승인 대기 업체·기술자 수 배지용 (심사 요청을 대시보드에서 바로 인지)
  const { data: provData } = usePolling<{
    providers: { approvalStatus: string }[];
  }>('/api/admin/providers', 30_000);
  const pendingProviders = (provData?.providers ?? []).filter(
    (p) => p.approvalStatus === 'PENDING',
  ).length;
  const { data: techData } = usePolling<{
    technicians: { approvalStatus: string }[];
  }>('/api/admin/technicians', 30_000);
  const pendingTechnicians = (techData?.technicians ?? []).filter(
    (t) => t.approvalStatus === 'PENDING',
  ).length;
  const all = data?.requests ?? [];
  const loading = !data && !error;
  const statuses = TABS.find((t) => t.key === tab)?.statuses ?? null;
  const byTab = statuses ? all.filter((r) => statuses.includes(r.status)) : all;
  const query = q.trim().toLowerCase();
  const rows = query
    ? byTab.filter(
        (r) =>
          r.lookupCode.toLowerCase().includes(query) ||
          r.customerName.toLowerCase().includes(query) ||
          r.customerPhone.includes(q.trim()) ||
          r.description.toLowerCase().includes(query),
      )
    : byTab;

  return (
    <main className="min-h-screen">
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur">
        <header className="border-b border-gray-100 p-4 pb-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold">관리자 대시보드</h1>
            <span className="md:hidden">
              <LogoutButton loginPath="/admin/login" />
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 md:hidden">
            <Link
              href="/admin/providers"
              className="relative rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-50"
            >
              업체 관리
              {pendingProviders > 0 && (
                <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                  {pendingProviders}
                </span>
              )}
            </Link>
            <Link
              href="/admin/technicians"
              className="relative rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-50"
            >
              기술자 관리
              {pendingTechnicians > 0 && (
                <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                  {pendingTechnicians}
                </span>
              )}
            </Link>
            <Link
              href="/admin/settings"
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-50"
            >
              설정
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

        <div className="px-2 pb-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="접수번호 · 이름 · 전화 · 내용 검색"
            aria-label="접수 검색"
            className="w-full rounded-xl border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="p-4">
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        {loading && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        )}
        {!loading && rows.length === 0 && (
          <p className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-500">
            해당하는 접수가 없습니다
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
          <Link
            key={r.id}
            href={`/admin/requests/${r.id}`}
            className={`block rounded-2xl border p-4 transition-shadow hover:shadow-md ${
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
              <span className="text-xs text-gray-500">#{r.lookupCode}</span>
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-gray-800">{r.description}</p>
            <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
              <span>
                {r.customerName} · {r.customerPhone}
              </span>
              <span>{new Date(r.createdAt).toLocaleString('ko-KR')}</span>
            </div>
            {r.assigneeName && (
              <p className="mt-1 text-xs font-medium text-blue-600">
                → {r.assigneeName}
                {r.assigneeKind === 'TECHNICIAN' && (
                  <span className="ml-1 text-gray-500">(기술자)</span>
                )}
              </p>
            )}
          </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
