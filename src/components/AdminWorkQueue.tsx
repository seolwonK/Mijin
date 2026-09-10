'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import SelectedRequestPanel from '@/components/SelectedRequestPanel';
import { AdminStatusTag, AdminUrgencyTag } from '@/components/AdminStatusTag';
import { RefreshIcon, SearchIcon } from '@/components/icons';
import styles from '@/components/admin-queue.module.css';

export type AdminWorkQueueRequest = {
  id: string; lookupCode: string; customerName: string; customerPhone: string;
  description: string; urgency: string; status: string; address?: string | null;
  needsAttention: boolean; createdAt: string; assigneeName: string | null;
  survey: { submitted: boolean; rating: number | null } | null;
};
export type AdminQueueSummary = { received: number | null; needsAttention: number | null; urgentOpen: number | null };
const TABS = [
  { key: 'ALL', label: '전체', statuses: null },
  { key: 'RECEIVED', label: '배정대기', statuses: ['RECEIVED'] },
  { key: 'ASSIGNED', label: '배정됨', statuses: ['ASSIGNED'] },
  { key: 'ACTIVE', label: '진행중', statuses: ['ACCEPTED', 'DISPATCHED'] },
  { key: 'DONE', label: '완료/취소', statuses: ['COMPLETED', 'CANCELED'] },
] as const;
const PAGE_SIZE = 25;
const number = (value: number | null) => value == null ? '—' : value.toLocaleString('ko-KR');

function RequestContent({ request, selected, expanded, onSelect, onExpand }: {
  request: AdminWorkQueueRequest; selected: boolean; expanded: boolean; onSelect: () => void; onExpand: () => void;
}) {
  const description = useRef<HTMLSpanElement>(null);
  const address = useRef<HTMLSpanElement>(null);
  const [canExpand, setCanExpand] = useState(false);
  useEffect(() => {
    if (expanded) return;
    const check = () => setCanExpand([description.current, address.current].some(node => node && node.clientHeight > 0 && node.scrollHeight > node.clientHeight + 1));
    const observer = new ResizeObserver(check);
    if (description.current) observer.observe(description.current);
    if (address.current) observer.observe(address.current);
    check();
    return () => observer.disconnect();
  }, [request.description, request.address, expanded]);
  return <div className={styles.requestContent} data-expanded={expanded}>
    <button type="button" className={styles.contentButton} onClick={onSelect} aria-pressed={selected} aria-label={`접수 ${request.lookupCode} 선택`} data-request-id={request.id}>
      <span className={styles.meta}><span className={styles.code}>#{request.lookupCode}</span><AdminUrgencyTag urgency={request.urgency} />{request.needsAttention && <span className={styles.attention}>확인 필요</span>}</span>
      <span ref={description} className={styles.description}>{request.description}</span>
    </button>
    <div className={styles.contentFoot}>
      {request.address && <span ref={address} className={styles.address}>{request.address}</span>}
      {(canExpand || expanded) && <button type="button" onClick={onExpand} className={styles.expand} aria-expanded={expanded} aria-label={`접수 ${request.lookupCode} 내용 ${expanded ? '접기' : '펼치기'}`}>{expanded ? '접기' : '내용 펼치기'}</button>}
    </div>
  </div>;
}
function Progress({ request }: { request: AdminWorkQueueRequest }) {
  return <><AdminStatusTag status={request.status} />{request.assigneeName && <span className={styles.secondary}>{request.assigneeName}</span>}{request.status === 'COMPLETED' && <span className={styles.secondary}>설문 {request.survey?.submitted ? request.survey.rating != null ? `${request.survey.rating} / 5점` : '응답 완료' : request.survey ? '미응답' : '미생성'}</span>}</>;
}
function RequestTime({ value }: { value: string }) {
  const date = new Date(value);
  return <time dateTime={value} className={styles.time}><span>{date.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', timeZone: 'Asia/Seoul' })}</span><span>{date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' })}</span></time>;
}

export default function AdminWorkQueue({ requests, refresh, summary, lastUpdatedAt }: {
  requests: AdminWorkQueueRequest[]; refresh: () => void | Promise<void>; summary?: AdminQueueSummary; lastUpdatedAt?: number | null;
}) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState('ALL');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [order, setOrder] = useState<'priority' | 'oldest' | 'newest'>('priority');
  const [refreshing, setRefreshing] = useState(false);
  const root = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const requestedTab = searchParams.get('tab');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (TABS.some(item => item.key === requestedTab)) { setTab(requestedTab!); setPage(1); setSelectedId(null); }
  }, [searchParams]);

  const active = requests.filter(r => ['ACCEPTED', 'DISPATCHED'].includes(r.status)).length;
  const attention = summary ? summary.needsAttention : requests.filter(r => r.needsAttention).length;
  const received = summary ? summary.received : requests.filter(r => r.status === 'RECEIVED').length;
  const urgent = summary ? summary.urgentOpen : requests.filter(r => ['CRITICAL', 'URGENT'].includes(r.urgency) && !['COMPLETED', 'CANCELED'].includes(r.status)).length;
  const scope = summary ? '전체 접수 기준' : '조회된 접수 기준';
  const rows = useMemo(() => {
    const statuses = TABS.find(item => item.key === tab)?.statuses;
    const q = query.trim().toLowerCase();
    const phoneQuery = q.replace(/[ -]/g, '');
    return requests.filter(r => (!statuses || statuses.includes(r.status as never)) && (!attentionOnly || r.needsAttention) && (!q || r.lookupCode.toLowerCase().includes(q) || r.customerName.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.address?.toLowerCase().includes(q) || (/^\d+$/.test(phoneQuery) && r.customerPhone.replace(/[ -]/g, '').includes(phoneQuery))))
      .sort((a, b) => {
        const priority = (r: AdminWorkQueueRequest) => r.needsAttention ? 0 : r.status === 'RECEIVED' ? 1 : 2;
        if (order === 'priority' && priority(a) !== priority(b)) return priority(a) - priority(b);
        return (Date.parse(a.createdAt) - Date.parse(b.createdAt)) * (order === 'oldest' ? 1 : -1);
      });
  }, [requests, tab, query, attentionOnly, order]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selected = rows.find(r => r.id === selectedId);
  function resetList() { setPage(1); setSelectedId(null); list.current?.scrollTo({ top: 0 }); }
  function changeTab(value: string) { setTab(value); setAttentionOnly(false); resetList(); }
  function closePanel() {
    const id = selectedId;
    setSelectedId(null);
    requestAnimationFrame(() => {
      const buttons = root.current?.querySelectorAll<HTMLButtonElement>('[data-request-id]');
      Array.from(buttons ?? []).find(el => el.dataset.requestId === id && el.getClientRects().length)?.focus({ preventScroll: true });
    });
  }
  function changePage(value: number) {
    setPage(value); setSelectedId(null); list.current?.scrollTo({ top: 0 });
    if (window.innerWidth < 1440) root.current?.querySelector('#request-list-title')?.scrollIntoView({ block: 'start' });
  }
  function expand(id: string) { setExpandedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  async function reload() { setRefreshing(true); try { await refresh(); } finally { setRefreshing(false); } }
  const requestContent = (request: AdminWorkQueueRequest) => <RequestContent request={request} selected={selectedId === request.id} expanded={expandedIds.has(request.id)} onSelect={() => setSelectedId(request.id)} onExpand={() => expand(request.id)} />;

  return <section ref={root} className={styles.page} aria-label="관리자 접수 관리">
    <header className={styles.header}>
      <div className={styles.heading}><h1>접수 관리</h1><span>대시보드</span></div>
      <div className={styles.headerActions}>{lastUpdatedAt && <time className={styles.updated} dateTime={new Date(lastUpdatedAt).toISOString()}>{new Date(lastUpdatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' })} 갱신</time>}<Link href="/admin/analytics/dashboard">분석 보기</Link><button type="button" className={styles.button} onClick={reload} disabled={refreshing}><RefreshIcon className={refreshing ? styles.spinning : ''} />{refreshing ? '갱신 중…' : '새로고침'}</button></div>
    </header>
    <div className={styles.metrics} aria-label="접수 요약">
      <button type="button" className={styles.metric} data-attention={!!attention} onClick={() => { setTab('ALL'); setAttentionOnly(true); resetList(); }} aria-label="관리자 확인 접수 보기"><span className={styles.metricLabel}>관리자 확인</span><span className={styles.metricMain}><strong>{number(attention)}</strong><span>{scope}</span></span></button>
      <button type="button" className={styles.metric} onClick={() => changeTab('RECEIVED')} aria-label="배정 대기 탭으로 이동"><span className={styles.metricLabel}>배정 대기</span><span className={styles.metricMain}><strong>{number(received)}</strong><span>{scope}</span></span></button>
      <button type="button" className={styles.metric} onClick={() => changeTab('ACTIVE')} aria-label="진행 중 접수 보기"><span className={styles.metricLabel}>진행 중</span><span className={styles.metricMain}><strong>{number(active)}</strong><span>조회된 접수 기준</span></span></button>
      <Link className={styles.metric} href="/admin/analytics/dashboard#operational" data-urgent={!!urgent}><span className={styles.metricLabel}>긴급 미완료</span><span className={styles.metricMain}><strong>{number(urgent)}</strong><span>{scope}</span></span></Link>
    </div>
    <div className={styles.workspace} data-selected={!!selected}>
      <div className={styles.queue}>
        <div className={styles.toolbar}>
          <div className={styles.toolbarTop}><div className={styles.listTitle}><h2 id="request-list-title">접수 목록 <span>{number(rows.length)}</span></h2><span>최근 최대 200건</span></div><div className={styles.searchField}><SearchIcon /><input type="search" value={query} onChange={e => { setQuery(e.target.value); resetList(); }} placeholder="접수번호 · 고객 · 주소 · 내용" aria-label="접수 검색" className={styles.search} /></div></div>
          <div className={styles.filters}><div className={styles.tabs} role="group" aria-label="접수 상태 필터">{TABS.map(item => {
            const count = item.statuses ? requests.filter(r => item.statuses.includes(r.status as never)).length : requests.length;
            return <button key={item.key} type="button" onClick={() => changeTab(item.key)} aria-pressed={tab === item.key && !attentionOnly}>{item.label}<span>{number(count)}</span></button>;
          })}</div><select className={styles.sort} aria-label="접수 정렬" value={order} onChange={e => { setOrder(e.target.value as typeof order); resetList(); }}><option value="priority">처리 우선순</option><option value="oldest">오래된 순</option><option value="newest">최근 순</option></select></div>
          {attentionOnly && <p className={styles.filterNote}>관리자 확인이 필요한 접수 <button type="button" onClick={() => { setAttentionOnly(false); resetList(); }}>필터 해제 ×</button></p>}
        </div>
        <div ref={list} className={styles.listScroll} role="region" aria-label="접수 목록 스크롤" tabIndex={0}>
          {!rows.length ? <div className={styles.empty}><strong>{query.trim() || tab !== 'ALL' || attentionOnly ? '조건에 해당하는 접수가 없습니다.' : '아직 접수된 요청이 없습니다.'}</strong><p>새 접수가 들어오면 이곳에서 확인할 수 있습니다.</p></div> : <>
            <div className={styles.tableViewport}><table className={styles.table}><caption className="sr-only">접수 내용과 고객, 진행 상태 목록</caption><thead><tr><th scope="col">접수 내용</th><th scope="col">고객</th><th scope="col">진행 상태</th><th scope="col" aria-sort={order === 'priority' ? 'none' : order === 'oldest' ? 'ascending' : 'descending'}><button type="button" onClick={() => { setOrder(order === 'oldest' ? 'newest' : 'oldest'); resetList(); }}>접수 시각 <span aria-hidden="true">{order === 'oldest' ? '↑' : order === 'newest' ? '↓' : '↕'}</span></button></th></tr></thead><tbody>{visible.map(request => <tr key={request.id} className={styles.row} data-selected={selectedId === request.id} onClick={e => { if (!(e.target as HTMLElement).closest('button, a')) setSelectedId(request.id); }}>
              <td>{requestContent(request)}</td><td><p className={styles.customer}>{request.customerName}</p><a href={`tel:${request.customerPhone}`} className={styles.phone}>{request.customerPhone}</a></td><td><Progress request={request} /></td><td><RequestTime value={request.createdAt} /></td>
            </tr>)}</tbody></table></div>
            <ul className={styles.mobileList}>{visible.map(request => <li key={request.id} className={styles.mobileItem} data-selected={selectedId === request.id}>{requestContent(request)}<div className={styles.mobileBottom}><div><p className={styles.customer}>{request.customerName}</p><a className={styles.phone} href={`tel:${request.customerPhone}`}>{request.customerPhone}</a></div><div><Progress request={request} /></div><RequestTime value={request.createdAt} /></div></li>)}</ul>
          </>}
        </div>
        {!!rows.length && <nav className={styles.pagination} aria-label="접수 목록 페이지"><p>{number((currentPage - 1) * PAGE_SIZE + 1)}–{number(Math.min(currentPage * PAGE_SIZE, rows.length))} / {number(rows.length)}건</p><div><button type="button" className={styles.button} disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)}>이전</button><span>{currentPage} / {pageCount}</span><button type="button" className={styles.button} disabled={currentPage === pageCount} onClick={() => changePage(currentPage + 1)}>다음</button></div></nav>}
      </div>
      {selected && <div id="request-inspector" className={styles.inspector}><SelectedRequestPanel key={selected.id} requestId={selected.id} onAssigned={refresh} onClose={closePanel} /></div>}
    </div>
  </section>;
}
