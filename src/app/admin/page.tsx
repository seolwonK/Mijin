'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePolling } from '@/components/usePolling';
import { StatusBadge, UrgencyBadge } from '@/components/StatusBadge';
import LogoutButton from '@/components/LogoutButton';
import { CardSkeleton } from '@/components/Skeleton';
import AdminMetricStrip from '@/components/AdminMetricStrip';
import AdminDataTable, { type Column } from '@/components/AdminDataTable';
import AdminInspector from '@/components/AdminInspector';
import { AdminStatusTag, AdminUrgencyTag } from '@/components/AdminStatusTag';
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

type ColKey = 'status' | 'code' | 'urgency' | 'desc' | 'who' | 'time' | 'assignee' | 'survey';

// "관제탑"(B) 콘셉트 실물 반영 — 데스크톱(md+)은 메트릭 스트립 + 정렬 가능 DataTable +
// 우측 인스펙터로 전면 재구성한다. 모바일은 기존 카드 그리드 UI를 그대로 유지한다
// (V 콘셉트 B는 1440px 커맨드센터 전제 — 모바일 admin은 이번 F 스코프 밖, 회귀 없이 보존만).
// 상단 내비(대시보드/업체/기술자/설정)는 AdminShell(레이아웃)이 데스크톱 전용으로 담당하므로
// 여기서는 더 이상 중복 렌더하지 않는다.
export default function AdminDashboardPage() {
  const [tab, setTab] = useState('ALL');
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, error } = usePolling<{ requests: RequestRow[] }>(
    '/api/admin/requests',
    8_000,
  );
  // 승인 대기 업체·기술자 수 배지용 — 모바일 퀵링크 전용. 데스크톱 배지는 AdminShell이
  // 동일 API를 별도로 폴링한다(뷰포트 무관하게 항상 1회 마운트, 중복 아님).
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

  // 메트릭 스트립 — 표시 가능한 실데이터만 쓴다(평균 배정시간처럼 현재 API가 계산해 주지 않는
  // 값은 만들어내지 않고 뺐다).
  const received = all.filter((r) => r.status === 'RECEIVED').length;
  const active = all.filter((r) => ['ACCEPTED', 'DISPATCHED'].includes(r.status)).length;
  const done = all.filter((r) => ['COMPLETED', 'CANCELED'].includes(r.status)).length;
  const needsAttentionCount = all.filter((r) => r.needsAttention).length;

  const selected = rows.find((r) => r.id === selectedId) ?? rows[0] ?? null;

  const columns: Column<RequestRow, ColKey>[] = [
    { key: 'status', label: '상태', width: '112px', render: (r) => <AdminStatusTag status={r.status} /> },
    {
      key: 'code',
      label: '접수번호',
      width: '104px',
      render: (r) => <span className="font-mono font-semibold text-admin-cyan">{r.lookupCode}</span>,
    },
    { key: 'urgency', label: '긴급도', width: '76px', render: (r) => <AdminUrgencyTag urgency={r.urgency} /> },
    {
      key: 'desc',
      label: '내용',
      render: (r) => (
        <span className="line-clamp-1">
          {r.description}
          {r.needsAttention && (
            <span className="ml-2 inline-flex items-center gap-1 font-mono text-[10.5px] text-admin-red">
              <AlertIcon className="h-3 w-3 shrink-0" />
              확인요망
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'who',
      label: '고객',
      width: '190px',
      render: (r) => (
        <span className="text-admin-dim">
          {r.customerName} · {r.customerPhone}
        </span>
      ),
    },
    {
      key: 'time',
      label: '시각',
      width: '96px',
      align: 'right',
      sortable: true,
      sortValue: (r) => new Date(r.createdAt).getTime(),
      render: (r) => (
        <span className="font-mono text-admin-dim">
          {new Date(r.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      ),
    },
    {
      key: 'assignee',
      label: '배정',
      width: '140px',
      align: 'right',
      render: (r) => (
        <span className={r.assigneeName ? 'font-semibold text-admin-cyan' : 'text-admin-faint'}>
          {r.assigneeName ?? '—'}
        </span>
      ),
    },
    {
      key: 'survey',
      label: '조사',
      width: '84px',
      align: 'right',
      render: (r) => {
        if (r.status !== 'COMPLETED') return <span className="text-admin-faint">-</span>;
        if (!r.survey) return <span className="text-admin-dim">미발송</span>;
        if (!r.survey.submitted) return <span className="text-admin-dim">미참여</span>;
        return (
          <span className="font-mono font-semibold text-admin-cyan">
            {r.survey.rating != null ? `★${r.survey.rating}` : '참여'}
          </span>
        );
      },
    },
  ];

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

      {/* ── 데스크톱(md+) — "관제탑" 커맨드센터 ── */}
      <div className="hidden bg-admin-bg text-admin-ink md:block">
        {/* 얇은 배너 밴드 — hero-2-bluehour.png(webp) 텍스처, 관제탑 절제 원칙상 이미지는
            30% 불투명도 + 짙은 네이비 그라데이션으로 거의 질감만 남긴다(텍스트 없음, 정보는
            아래 AdminMetricStrip이 전담). .omc/research/blue-pro/candidates/hero-2-bluehour.png */}
        <div className="relative h-16 overflow-hidden border-b border-admin-border">
          <Image
            src="/images/banner-admin.webp"
            alt=""
            fill
            sizes="100vw"
            style={{ objectFit: 'cover' }}
            className="opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-admin-bg via-admin-bg/85 to-admin-bg/40" />
        </div>
        <AdminMetricStrip
          metrics={[
            { label: '오늘 접수', value: all.length },
            {
              label: '배정 대기',
              value: received,
              tone: needsAttentionCount > 0 ? 'warn' : 'default',
              sub: needsAttentionCount > 0 ? `확인 필요 ${needsAttentionCount}건` : undefined,
            },
            { label: '진행중', value: active, tone: 'accent' },
            { label: '완료 · 취소', value: done },
          ]}
        />

        <div className="flex items-center gap-4 border-b border-admin-border px-4 py-2.5">
          <div className="flex gap-1">
            {TABS.map((t) => {
              const count = t.statuses
                ? all.filter((r) => t.statuses!.includes(r.status)).length
                : all.length;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`rounded-admin-md px-3 py-1.5 text-[12.5px] font-semibold ${
                    tab === t.key ? 'bg-admin-surface text-admin-ink' : 'text-admin-dim hover:text-admin-ink'
                  }`}
                >
                  {t.label} <span className="font-mono text-admin-faint">{count > 0 && count}</span>
                </button>
              );
            })}
          </div>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="접수번호 · 이름 · 전화 · 내용 검색"
            aria-label="접수 검색"
            className="ml-auto w-80 rounded-admin-md border border-admin-border bg-admin-surface px-3 py-1.5 text-[12.5px] text-admin-ink placeholder:text-admin-faint focus:border-admin-cyan focus:outline-none"
          />
        </div>

        {error && <p className="px-4 py-2 text-sm text-admin-red">{error}</p>}

        <div className="flex">
          <div className="min-w-0 flex-1">
            {loading && <p className="p-4 text-sm text-admin-faint">불러오는 중…</p>}
            {!loading && rows.length === 0 && (
              <p className="p-8 text-center text-sm text-admin-faint">해당하는 접수가 없습니다</p>
            )}
            {!loading && rows.length > 0 && (
              <AdminDataTable
                columns={columns}
                rows={rows}
                rowKey={(r) => r.id}
                selectedKey={selected?.id ?? null}
                onRowClick={(r) => setSelectedId(r.id)}
                rowClassName={(r) => (r.needsAttention ? 'bg-admin-red/5' : '')}
              />
            )}
          </div>

          <AdminInspector
            eyebrow="SELECTED REQUEST"
            title={selected?.lookupCode}
            flag={
              selected?.needsAttention ? (
                <>
                  <AlertIcon className="h-4 w-4 shrink-0 translate-y-px" />
                  관리자 확인 필요 — 자동배정 실패 또는 업체 거절
                </>
              ) : undefined
            }
            fields={
              selected
                ? [
                    { label: '상태', value: <AdminStatusTag status={selected.status} /> },
                    { label: '긴급도', value: <AdminUrgencyTag urgency={selected.urgency} /> },
                    { label: '고객', value: selected.customerName },
                    { label: '전화', value: selected.customerPhone },
                    {
                      label: '접수시각',
                      value: new Date(selected.createdAt).toLocaleTimeString('ko-KR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      }),
                    },
                  ]
                : undefined
            }
            description={selected?.description}
            primaryHref={selected ? `/admin/requests/${selected.id}` : undefined}
            primaryLabel="상세 열기 · 배정"
            empty={loading ? '불러오는 중…' : '표시할 접수가 없습니다'}
          />
        </div>
      </div>
    </main>
  );
}
