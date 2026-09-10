'use client';
import { useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { usePolling, refreshPortal } from '@/components/usePolling';
import LogoutButton from '@/components/LogoutButton';
import PortalLoadState from '@/components/PortalLoadState';
import PortalSupportLink from '@/components/PortalSupportLink';
import {
  CommissionEntries,
  type CommissionSummaryData,
} from '@/components/CommissionSummary';
import PortalEggCard from '@/components/PortalEggCard';
import PortalJobCard, { type PortalJob } from '@/components/PortalJobCard';
import PortalReferralSection from '@/components/PortalReferralSection';
import type { PortalStats } from '@/components/PortalStatsCard';
import styles from '@/components/portal-dashboard.module.css';
import PortalReviewSection from '@/components/PortalReviewSection';
import { useNewJobAlert } from '@/components/useNewJobAlert';
export type PortalJobsData = {
  jobs: PortalJob[];
  totalPast: number;
  nextCursor: string | null;
};
export default function PortalHome({ scope }: { scope: 'partner' | 'tech' }) {
  const jobsState = usePolling<PortalJobsData>(`/api/${scope}/jobs`, 5_000);
  const stats = usePolling<PortalStats>(`/api/${scope}/stats`, 30_000);
  const commission = usePolling<CommissionSummaryData>(
    `/api/${scope}/commissions`,
    30_000,
  );
  const contract = usePolling<{ contract: { status: string } }>(
    scope === 'tech' ? '/api/tech/contract' : null,
    30_000,
  );
  const [refreshing, setRefreshing] = useState(false);
  const { data, error, refresh, lastUpdatedAt } = jobsState;
  const jobs = data?.jobs ?? [];
  const waiting = jobs.filter((j) => j.status === 'REQUESTED');
  const progress = jobs.filter(
    (j) =>
      j.status === 'ACCEPTED' &&
      ['ACCEPTED', 'DISPATCHED'].includes(j.request.status),
  );
  const past = jobs.filter(
    (j) => !waiting.includes(j) && !progress.includes(j),
  );
  const title = scope === 'partner' ? '업체 포털' : '전기기사 포털';
  const { notifPermission, enableNotifications } = useNewJobAlert({
    waitingIds: waiting.map((j) => j.id),
    ready: !!data,
    baseTitle: title,
  });
  const signed = contract.data?.contract.status === 'CONFIRMED';
  async function reload() {
    setRefreshing(true);
    try {
      await refreshPortal();
    } finally {
      setRefreshing(false);
    }
  }
  const contractLink = (
    <Link
      href="/tech/contract"
      className={`block rounded-xl border p-4 ${signed ? 'border-border bg-white' : 'border-amber-300 bg-amber-50'}`}
    >
      <span className="font-semibold">
        근로확인서 {signed ? '서명 완료 · 보기' : '작성 필요 →'}
      </span>
      {!signed && (
        <p className="mt-1 text-sm text-amber-900">
          근무조건을 확인하고 서명을 완료해야 배정을 받을 수 있습니다.
        </p>
      )}
    </Link>
  );
  return (
    <main className={styles.page}>
      <PageHeader
        title={title}
        width="max-w-6xl"
        right={
          <>
            <Link href={`/${scope}/profile`} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold">
              내 정보
            </Link>
            <LogoutButton loginPath={`/${scope}/login`} />
          </>
        }
      />
      <div className={styles.content}>
        <div className={styles.toolbar}>
          <h2 id="overview-title">운영 현황</h2>
          <div className={styles.toolbarActions}>
            {lastUpdatedAt && <time dateTime={new Date(lastUpdatedAt).toISOString()}>
              {new Date(lastUpdatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })} 기준
            </time>}
            <button onClick={reload} disabled={refreshing} className={styles.refresh}>
              {refreshing ? '새로고침 중…' : '전체 새로고침'}
            </button>
          </div>
        </div>
        <section className={styles.overview} aria-labelledby="overview-title">
          <div className={styles.balances}>
            <PortalEggCard role={scope} />
            <Link href={`/${scope}/commissions`} className={styles.money}>
              <span className={styles.label}>소개 수수료</span>
              <span className={styles.value}>
                {commission.data ? (commission.data.pendingTotal + commission.data.paidTotal).toLocaleString('ko-KR') : '–'}<small>원</small>
              </span>
              <span className={styles.metricNote}>누적 적립 · 전체 기간 <span aria-hidden="true">↗</span></span>
            </Link>
          </div>
          <div className={styles.queues}>
            <a href="#waiting" className={styles.queue} data-attention={waiting.length > 0}>
              <span className={styles.label}>응답 대기</span>
              <strong>{data ? waiting.length : '–'}<small>건</small></strong>
              <span className={styles.metricNote}>수락 여부를 확인해 주세요</span>
            </a>
            <a href="#progress" className={styles.queue}>
              <span className={styles.label}>진행 중</span>
              <strong>{data ? progress.length : '–'}<small>건</small></strong>
              <span className={styles.metricNote}>수락·출동 중인 작업</span>
            </a>
            <Link href={`/${scope}/history`} className={styles.queue}>
              <span className={styles.label}>30일 배정</span>
              <strong>{stats.data ? stats.data.assigned30d.toLocaleString('ko-KR') : '–'}<small>건</small></strong>
              <span className={styles.metricNote}>수락 {stats.data ? stats.data.accepted30d.toLocaleString('ko-KR') : '–'}건 · 최근 30일</span>
            </Link>
          </div>
          <div className={styles.overviewFooter}>
            <span>30일 수락 <strong>{stats.data ? stats.data.accepted30d.toLocaleString('ko-KR') : '–'}</strong>건</span>
            <a href="#reviews">평균 별점 <strong>{stats.data?.avgRating == null ? '–' : stats.data.avgRating.toFixed(1)}</strong> · 후기 {stats.data ? stats.data.reviewCount.toLocaleString('ko-KR') : '–'}건 <span aria-hidden="true"> ↗</span></a>
          </div>
          <div className={styles.errors}>
            <PortalLoadState label="내 성과" error={stats.error} loading={!stats.data && !stats.error} retry={stats.refresh} stale={!!stats.data} />
            <PortalLoadState label="소개 수수료" error={commission.error} loading={!commission.data && !commission.error} retry={commission.refresh} stale={!!commission.data} />
          </div>
        </section>
        {scope === 'tech' && (
          <div className={styles.contract}>
            <PortalLoadState label="근로확인서" error={contract.error} loading={!contract.data && !contract.error} retry={contract.refresh} stale={!!contract.data} />
            {contract.data && !signed && contractLink}
          </div>
        )}
        <div className={styles.columns}>
          <div className={styles.work}>
            <PortalLoadState label="배정 목록" error={error} loading={!data && !error} retry={refresh} stale={!!data} />
            {data && ([
              ['waiting', '응답 대기', waiting],
              ['progress', '진행 중', progress],
            ] as const).map(([id, label, list]) => (
              <section key={id} id={id} className={styles.section} aria-labelledby={`${id}-title`}>
                <div className={styles.sectionHeader}>
                  <h2 id={`${id}-title`}>{label} <span>{list.length}</span></h2>
                  <span className={styles.sectionHint}>{id === 'waiting' ? '배정 후 10분 안에 응답' : '현장별 진행 상태를 확인하세요'}</span>
                </div>
                <div className={styles.list}>
                  {list.length ? list.map(job => (
                    <PortalJobCard
                      key={job.id}
                      job={job}
                      scope={scope}
                      activeQueue
                      priorHistory={past.filter(candidate =>
                        candidate.request.id !== job.request.id &&
                        !!job.request.address &&
                        candidate.request.address === job.request.address &&
                        Date.parse(candidate.createdAt) < Date.parse(job.createdAt)
                      ).filter((candidate, i, rows) => rows.findIndex(row => row.request.id === candidate.request.id) === i)}
                    />
                  )) : <p className={styles.empty}>{id === 'waiting' ? '새로 배정된 건이 없습니다.' : '진행 중인 건이 없습니다.'}</p>}
                </div>
              </section>
            ))}
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2>지난 내역</h2>
                <Link href={`/${scope}/history`}>전체 보기{data ? ` (${data.totalPast}건)` : ''} →</Link>
              </div>
              {data && <div className={styles.list}>
                {past.length ? past.slice(0, 4).map(job => <PortalJobCard key={job.id} job={job} scope={scope} />)
                  : <p className={styles.empty}>지난 배정 내역이 없습니다.</p>}
              </div>}
            </section>
            <div className={styles.support}>
              {notifPermission === 'default' && <button onClick={enableNotifications}>새 배정 브라우저 알림 켜기</button>}
              {notifPermission === 'denied' && <Link href="/support#notifications">알림이 차단되어 있습니다 · 설정 안내</Link>}
              <PortalSupportLink />
            </div>
          </div>
          <div className={styles.aside}>
            <section>
              <div className={styles.sectionHeader}>
                <h2>최근 수수료</h2>
                <Link href={`/${scope}/commissions`}>전체 내역 →</Link>
              </div>
              {commission.data && <div className={styles.panel}>
                {commission.data.entries.length
                  ? <CommissionEntries entries={commission.data.entries.slice(0, 3)} />
                  : <p className="py-4 text-sm text-muted">아직 적립된 소개 수수료가 없습니다.</p>}
                <Link href={`/${scope}/commissions`} className={styles.panelLink}>수수료 전체 내역 ({commission.data.totalCount}건) →</Link>
              </div>}
            </section>
            <PortalReferralSection url={`/api/${scope}/referrals`} />
            <div id="reviews"><PortalReviewSection url={`/api/${scope}/reviews`} /></div>
            {scope === 'tech' && signed && contractLink}
          </div>
        </div>
      </div>
    </main>
  );
}
