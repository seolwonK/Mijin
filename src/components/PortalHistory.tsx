'use client';
import { useState } from 'react';
import PageHeader from '@/components/PageHeader';
import PortalLoadState from '@/components/PortalLoadState';
import PortalJobCard from '@/components/PortalJobCard';
import { usePolling } from '@/components/usePolling';
import type { PortalJobsData } from '@/components/PortalHome';
import {
  CommissionEntries,
  type CommissionSummaryData,
} from '@/components/CommissionSummary';
import styles from '@/components/portal-dashboard.module.css';
export default function PortalHistory({
  scope,
  commissions = false,
  initialQuery = '',
}: {
  scope: 'partner' | 'tech';
  commissions?: boolean;
  initialQuery?: string;
}) {
  const [search, setSearch] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState('');
  const [cursors, setCursors] = useState<string[]>(['']);
  const params = new URLSearchParams({
    view: 'history',
    q: query,
    status,
    cursor: cursors[cursors.length - 1],
  });
  const endpoint = `/api/${scope}/${commissions ? 'commissions' : 'jobs'}?${params}`;
  const { data, error, refresh } = usePolling<
    PortalJobsData | CommissionSummaryData
  >(endpoint, 30_000);
  const title = commissions ? '소개 수수료 전체 내역' : '지난 배정 내역';
  const total = data
    ? 'jobs' in data
      ? data.totalPast
      : data.totalCount
    : null;
  return (
    <main className="min-h-screen bg-surface">
      <PageHeader title={title} back={`/${scope}`} />
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        {!commissions && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(search.trim());
              setCursors(['']);
            }}
            className="space-y-3 rounded-xl border border-border bg-white p-4"
          >
            <label
              className="block text-sm font-semibold"
              htmlFor="history-search"
            >
              주소·고장 내용·고객명 검색
            </label>
            <div className="flex gap-2">
              <input
                id="history-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                maxLength={100}
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-border px-3"
              />
              <button className="min-h-11 rounded-lg bg-brand-700 px-4 font-semibold text-white">
                검색
              </button>
            </div>
            <label
              className="block text-sm font-semibold"
              htmlFor="history-status"
            >
              배정 상태
            </label>
            <select
              id="history-status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setCursors(['']);
              }}
              className="min-h-11 w-full rounded-lg border border-border bg-white px-3"
            >
              <option value="">전체 상태</option>
              <option value="COMPLETED">작업 완료</option>
              <option value="REJECTED">거절한 배정</option>
              <option value="EXPIRED">응답 기한 만료</option>
              <option value="CANCELED">배정 취소</option>
            </select>
          </form>
        )}
        <PortalLoadState
          label={title}
          error={error}
          loading={!data && !error}
          retry={refresh}
          stale={!!data}
        />
        {data && (
          <>
            <p role="status" className="text-sm text-muted">
              {query && `“${query}” 검색 · `}총 {total}건 · {cursors.length}
              페이지
            </p>
            {'jobs' in data ? (
              data.jobs.length ? (
                <div className={styles.list}>
                  {data.jobs.map((job) => (
                    <PortalJobCard key={job.id} job={job} scope={scope} />
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-border bg-white p-6 text-sm text-muted">
                  조건에 맞는 배정 내역이 없습니다. 검색어나 상태를 바꿔 주세요.
                </p>
              )
            ) : (
              <section className="rounded-xl border border-border bg-white p-4">
                {data.entries.length ? (
                  <CommissionEntries entries={data.entries} />
                ) : (
                  <p className="text-sm text-muted">적립 내역이 없습니다.</p>
                )}
              </section>
            )}
            <nav
              aria-label="내역 페이지"
              className="flex items-center justify-between gap-3"
            >
              <button
                disabled={cursors.length === 1}
                onClick={() => {
                  setCursors((v) => v.slice(0, -1));
                  window.scrollTo({ top: 0 });
                }}
                className="min-h-11 rounded-lg border border-border bg-white px-5 disabled:opacity-40"
              >
                이전 페이지
              </button>
              <button
                disabled={!data.nextCursor}
                onClick={() => {
                  if (data.nextCursor)
                    setCursors((v) => [...v, data.nextCursor!]);
                  window.scrollTo({ top: 0 });
                }}
                className="min-h-11 rounded-lg border border-border bg-white px-5 disabled:opacity-40"
              >
                다음 페이지
              </button>
            </nav>
          </>
        )}
      </div>
    </main>
  );
}
