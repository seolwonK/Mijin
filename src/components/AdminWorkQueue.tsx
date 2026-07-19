'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AdminMetricStrip, { type Metric } from '@/components/AdminMetricStrip';
import AdminDataTable, { type Column } from '@/components/AdminDataTable';
import SelectedRequestPanel from '@/components/SelectedRequestPanel';
import { AdminStatusTag, AdminUrgencyTag } from '@/components/AdminStatusTag';
import { AlertIcon } from '@/components/icons';

export type AdminWorkQueueRequest = {
  id: string;
  lookupCode: string;
  customerName: string;
  customerPhone: string;
  description: string;
  urgency: string;
  status: string;
  needsAttention: boolean;
  createdAt: string;
  assigneeName: string | null;
  survey: { submitted: boolean; rating: number | null } | null;
};

const TABS = [
  { key: 'ALL', label: '전체', statuses: null },
  { key: 'RECEIVED', label: '배정대기', statuses: ['RECEIVED'] },
  { key: 'ASSIGNED', label: '배정됨', statuses: ['ASSIGNED'] },
  { key: 'ACTIVE', label: '진행중', statuses: ['ACCEPTED', 'DISPATCHED'] },
  { key: 'DONE', label: '완료/취소', statuses: ['COMPLETED', 'CANCELED'] },
] as const;
type ColKey = 'status' | 'code' | 'urgency' | 'desc' | 'who' | 'time' | 'assignee' | 'survey';

export default function AdminWorkQueue({ requests, refresh, extraMetrics = [], summary }: { requests: AdminWorkQueueRequest[]; refresh: () => void | Promise<void>; extraMetrics?: Metric[]; summary?: { received: number | null; needsAttention: number | null } }) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState('ALL');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    const requestedTab = searchParams.get('tab');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (TABS.some((item) => item.key === requestedTab)) setTab(requestedTab!);
  }, [searchParams]);
  const received = requests.filter((request) => request.status === 'RECEIVED').length;
  const active = requests.filter((request) => ['ACCEPTED', 'DISPATCHED'].includes(request.status)).length;
  const done = requests.filter((request) => ['COMPLETED', 'CANCELED'].includes(request.status)).length;
  const needsAttention = requests.filter((request) => request.needsAttention).length;
  const displayedReceived = summary ? (summary.received ?? '—') : received;
  const displayedNeedsAttention = summary ? (summary.needsAttention ?? null) : needsAttention;
  const rows = useMemo(() => {
    const statuses = TABS.find((item) => item.key === tab)?.statuses;
    const q = query.trim().toLowerCase();
    const filtered = requests.filter((request) => (!statuses || statuses.includes(request.status as never)) && (!q || request.lookupCode.toLowerCase().includes(q) || request.customerName.toLowerCase().includes(q) || request.customerPhone.includes(query.trim()) || request.description.toLowerCase().includes(q)));
    return [...filtered].sort((a, b) => {
      const priority = (request: AdminWorkQueueRequest) => request.needsAttention ? 0 : request.status === 'RECEIVED' ? 1 : 2;
      return priority(a) - priority(b);
    });
  }, [query, requests, tab]);
  const selected = rows.find((request) => request.id === selectedId) ?? null;
  const columns: Column<AdminWorkQueueRequest, ColKey>[] = [
    { key: 'status', label: '상태', width: '112px', render: (request) => <AdminStatusTag status={request.status} /> },
    { key: 'code', label: '접수번호', width: '104px', render: (request) => <span className="font-mono font-semibold text-admin-cyan-ink">{request.lookupCode}</span> },
    { key: 'urgency', label: '긴급도', width: '76px', render: (request) => <AdminUrgencyTag urgency={request.urgency} /> },
    { key: 'desc', label: '내용', render: (request) => <span className="line-clamp-1">{request.description}{request.needsAttention && <span className="ml-2 inline-flex items-center gap-1 font-mono text-[10.5px] text-red-600 md:text-sm"><AlertIcon className="h-3 w-3 shrink-0" />확인요망</span>}</span> },
    { key: 'who', label: '고객', width: '190px', render: (request) => <span className="text-neutral-600">{request.customerName} · {request.customerPhone}</span> },
    { key: 'time', label: '시각', width: '96px', align: 'right', sortable: true, sortValue: (request) => new Date(request.createdAt).getTime(), render: (request) => <span className="font-mono text-neutral-600">{new Date(request.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span> },
    { key: 'assignee', label: '배정', width: '140px', align: 'right', render: (request) => <span className={request.assigneeName ? 'font-semibold text-admin-cyan-ink' : 'text-muted'}>{request.assigneeName ?? '—'}</span> },
    { key: 'survey', label: '조사', width: '84px', align: 'right', render: (request) => request.status !== 'COMPLETED' ? <span className="text-muted">-</span> : !request.survey ? <span className="text-neutral-600">미발송</span> : !request.survey.submitted ? <span className="text-neutral-600">미참여</span> : <span className="font-mono font-semibold text-admin-cyan-ink">{request.survey.rating != null ? `★${request.survey.rating}` : '참여'}</span> },
  ];
  const panel = selected && <SelectedRequestPanel key={selected.id} requestId={selected.id} onAssigned={refresh} />;

  return <section className="bg-white text-fg">
    <AdminMetricStrip metrics={[{ label: '오늘 접수', value: requests.length }, { label: '배정 대기', value: displayedReceived, tone: (displayedNeedsAttention ?? 0) > 0 ? 'warn' : 'default', sub: displayedNeedsAttention != null && displayedNeedsAttention > 0 ? `확인 필요 ${displayedNeedsAttention}건` : undefined, onClick: () => setTab('RECEIVED'), ariaLabel: '배정 대기 탭으로 이동' }, { label: '진행중', value: active, tone: 'accent' }, { label: '완료 · 취소', value: done }, ...extraMetrics]} />
    <div className="flex flex-wrap items-center gap-3 border-y border-border px-4 py-2.5">
      <div className="flex gap-1">{TABS.map((item) => { const count = item.statuses ? requests.filter((request) => item.statuses.includes(request.status as never)).length : requests.length; return <button key={item.key} type="button" onClick={() => setTab(item.key)} aria-pressed={tab === item.key} className={`rounded-admin-md border px-3 py-1.5 text-sm font-semibold ${tab === item.key ? 'border-admin-cyan-ink bg-neutral-100 text-fg' : 'border-transparent text-neutral-600 hover:bg-neutral-100'}`}>{item.label} {count > 0 && <span className="font-mono">{count}</span>}</button>; })}</div>
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="접수번호 · 이름 · 전화 · 내용 검색" aria-label="접수 검색" className="ml-auto w-full rounded-admin-md border border-border bg-white px-3 py-1.5 text-sm focus:border-admin-cyan-ink focus:outline-none xl:w-80" />
    </div>
    {rows.length === 0 ? <p className="p-8 text-center text-sm text-muted">해당하는 접수가 없습니다</p> : <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start"><div className="min-w-0"><AdminDataTable columns={columns} rows={rows} rowKey={(request) => request.id} selectedKey={selectedId} onRowClick={(request) => setSelectedId(request.id)} rowClassName={(request) => request.needsAttention ? 'bg-red-50' : ''} /></div>{/* 단일 마운트 — md/lg에서는 표 아래, xl에서는 우측 열로 CSS 배치만 이동(이중 마운트 시 폴링이 2배가 된다) */}<div className={selected ? 'border-t border-border p-4 xl:border-t-0 xl:border-l' : 'hidden xl:block xl:border-l xl:border-border xl:p-4'}>{panel ?? <p className="text-sm text-muted">행을 선택하면 배정 정보를 표시합니다.</p>}</div></div>}
  </section>;
}
