'use client';

import { Suspense } from 'react';
import { usePolling } from '@/components/usePolling';
import AdminWorkQueue, { type AdminWorkQueueRequest } from '@/components/AdminWorkQueue';
import { useIsLg } from '@/components/useIsLg';
import styles from '@/components/admin-queue.module.css';

export default function AdminDashboardPage() {
  const isLg = useIsLg();
  const { data, error, refresh, lastUpdatedAt } = usePolling<{ requests: AdminWorkQueueRequest[] }>('/api/admin/requests', 8_000);
  const { data: summary, error: summaryError, refresh: refreshSummary } = usePolling<{ received: number; needsAttention: number; urgentOpen: number }>(isLg ? '/api/admin/analytics/summary' : null, 8_000);
  async function refreshAll() { await Promise.all([refresh(), refreshSummary()]); }
  return <main className={styles.main}>
    {error && <div role="alert" className={styles.pageError}><p>{data ? '최신 접수 목록을 확인하지 못했습니다. 마지막 조회 결과입니다.' : '접수 목록을 불러오지 못했습니다.'}</p><p>{error}</p><button type="button" className={styles.button} onClick={refresh}>다시 시도</button></div>}
    {summaryError && <p role="status" className={styles.pageError}>전체 현황을 갱신하지 못했습니다. 새로고침해 주세요.</p>}
    {!data ? !error && <p className="p-8 text-sm text-slate-600">접수 목록을 불러오는 중…</p> : <Suspense fallback={<p className="p-8 text-sm text-slate-600">접수 목록을 불러오는 중…</p>}>
      <AdminWorkQueue requests={data.requests} refresh={refreshAll} lastUpdatedAt={lastUpdatedAt} summary={isLg ? { received: summary?.received ?? null, needsAttention: summary?.needsAttention ?? null, urgentOpen: summary?.urgentOpen ?? null } : undefined} />
    </Suspense>}
  </main>;
}
