'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePolling } from '@/components/usePolling';
import { StatusBadge, UrgencyBadge } from '@/components/StatusBadge';
import LogoutButton from '@/components/LogoutButton';
import { CardSkeleton } from '@/components/Skeleton';
import AdminWorkQueue from '@/components/AdminWorkQueue';
import type { Metric } from '@/components/AdminMetricStrip';
import { AlertIcon } from '@/components/icons';

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
  survey: { submitted: boolean; rating: number | null } | null;
};

const TABS: { key: string; label: string; statuses: string[] | null }[] = [
  { key: 'ALL', label: '전체', statuses: null },
  { key: 'RECEIVED', label: '배정대기', statuses: ['RECEIVED'] },
  { key: 'ASSIGNED', label: '배정됨', statuses: ['ASSIGNED'] },
  { key: 'ACTIVE', label: '진행중', statuses: ['ACCEPTED', 'DISPATCHED'] },
  { key: 'DONE', label: '완료/취소', statuses: ['COMPLETED', 'CANCELED'] },
];
function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);

  return matches;
}


export default function AdminDashboardPage() {
  const [tab, setTab] = useState('ALL');
  const [q, setQ] = useState('');
  const isLg = useMediaQuery('(min-width: 1024px)');
  const isMobile = useMediaQuery('(max-width: 767px)');
  const { data, error, refresh } = usePolling<{ requests: RequestRow[] }>(
    '/api/admin/requests',
    8_000,
  );
  // 승인 대기 업체·기술자 수 배지용 — 모바일 퀵링크 전용.
  const { data: provData } = usePolling<{
    providers: { approvalStatus: string }[];
  }>(isMobile ? '/api/admin/providers' : null, 30_000);
  const pendingProviders = (provData?.providers ?? []).filter(
    (p) => p.approvalStatus === 'PENDING',
  ).length;
  const { data: techData } = usePolling<{
    technicians: { approvalStatus: string }[];
  }>(isMobile ? '/api/admin/technicians' : null, 30_000);
  const pendingTechnicians = (techData?.technicians ?? []).filter(
    (t) => t.approvalStatus === 'PENDING',
  ).length;
  const { data: summaryData } = usePolling<{
    received: number;
    needsAttention: number;
    urgentOpen: number;
    updatedAt: string;
  }>(isLg ? '/api/admin/analytics/summary' : null, 8_000);
  const extraMetrics: Metric[] = [
    {
      label: '긴급 미완료',
      value: summaryData?.urgentOpen ?? '—',
      tone: 'warn',
      href: '/admin/analytics/dashboard#operational',
      className: 'hidden lg:block',
    },
    {
      label: '분석 보기',
      value: '→',
      sub: '운영 현황',
      href: '/admin/analytics/dashboard',
      className: 'hidden lg:block',
    },
  ];
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
      {/* ── 모바일(md 미만) — 기존 카드 그리드 UI 그대로 보존 ── */}
      <div className="md:hidden">
        <div className="sticky top-0 z-20 bg-surface/85 backdrop-blur">
          <header className="border-b border-border p-4 pb-3">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold">관리자 대시보드</h1>
              <LogoutButton loginPath="/admin/login" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/admin/providers"
                className="relative rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 active:bg-neutral-50"
              >
                업체 관리
                {pendingProviders > 0 && (
                  <span className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                    {pendingProviders}
                  </span>
                )}
              </Link>
              <Link
                href="/admin/technicians"
                className="relative rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 active:bg-neutral-50"
              >
                기술자 관리
                {pendingTechnicians > 0 && (
                  <span className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                    {pendingTechnicians}
                  </span>
                )}
              </Link>
              {/* AdminShell 내비는 데스크톱 전용 — 모바일에서도 순환/정산에 도달할 수 있어야 한다 */}
              <Link
                href="/admin/rotation"
                className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 active:bg-neutral-50"
              >
                순환 현황
              </Link>
              <Link
                href="/admin/commissions"
                className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 active:bg-neutral-50"
              >
                정산
              </Link>
              <Link
                href="/admin/settings"
                className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 active:bg-neutral-50"
              >
                설정
              </Link>
            </div>
          </header>

          <div className="scrollbar-none flex gap-1 overflow-x-auto border-b border-border p-2">
            {TABS.map((t) => {
              const count = t.statuses
                ? all.filter((r) => t.statuses!.includes(r.status)).length
                : all.length;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  aria-pressed={tab === t.key}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${
                    tab === t.key ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-neutral-600'
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
              className="w-full rounded-xl border border-border p-2.5 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="p-4">
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          {loading && (
            <div className="grid gap-3">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
          )}
          {!loading && rows.length === 0 && (
            <p className="rounded-xl bg-neutral-50 p-6 text-center text-sm text-muted">
              해당하는 접수가 없습니다
            </p>
          )}
          <div className="grid gap-3">
            {rows.map((r) => (
              <Link
                key={r.id}
                href={`/admin/requests/${r.id}`}
                className={`block rounded-2xl border p-4 transition-shadow hover:shadow-card-hover ${
                  r.needsAttention ? 'border-red-400 bg-red-50' : 'border-border bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {r.needsAttention && (
                      <span title="관리자 확인 필요">
                        <AlertIcon className="h-4 w-4 text-red-600" />
                      </span>
                    )}
                    <UrgencyBadge urgency={r.urgency} />
                    <StatusBadge status={r.status} />
                  </div>
                  <span className="text-xs text-muted">#{r.lookupCode}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-fg">{r.description}</p>
                <div className="mt-1 flex items-center justify-between text-xs text-muted">
                  <span>
                    {r.customerName} · {r.customerPhone}
                  </span>
                  <span>{new Date(r.createdAt).toLocaleString('ko-KR')}</span>
                </div>
                {r.assigneeName && (
                  <p className="mt-1 text-xs font-medium text-brand-600">
                    → {r.assigneeName}
                    {r.assigneeKind === 'TECHNICIAN' && (
                      <span className="ml-1 text-muted">(기술자)</span>
                    )}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="hidden md:block">
        {error && <p className="px-4 py-2 text-sm text-red-600">{error}</p>}
        {loading ? (
          <p className="p-4 text-sm text-muted">불러오는 중…</p>
        ) : (
          <Suspense fallback={<p className="p-4 text-sm text-muted">불러오는 중…</p>}>
            <AdminWorkQueue requests={all} refresh={refresh} extraMetrics={extraMetrics} summary={isLg ? { received: summaryData?.received ?? null, needsAttention: summaryData?.needsAttention ?? null } : undefined} />
          </Suspense>
        )}
      </div>
    </main>
  );
}
