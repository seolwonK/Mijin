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
  const all = data?.requests ?? [];
  const statuses = TABS.find((t) => t.key === tab)?.statuses ?? null;
  const rows = statuses ? all.filter((r) => statuses.includes(r.status)) : all;

  return (
    <main className="min-h-screen">
      <header className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">관리자 대시보드</h1>
          <LogoutButton loginPath="/admin/login" />
        </div>
        <div className="mt-3 flex gap-4 text-sm">
          <Link href="/admin/providers" className="font-medium text-blue-600 underline">
            업체 관리
          </Link>
          <Link href="/admin/settings" className="font-medium text-blue-600 underline">
            자동배정 설정
          </Link>
        </div>
      </header>

      <div className="scrollbar-none flex gap-1 overflow-x-auto border-b border-gray-100 p-2">
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

      <div className="space-y-2 p-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {rows.length === 0 && (
          <p className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-400">
            해당하는 접수가 없습니다
          </p>
        )}
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
    </main>
  );
}
