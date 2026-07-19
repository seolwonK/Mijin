'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import PageHeader from '@/components/PageHeader';
import { usePolling } from '@/components/usePolling';
import { buttonClasses } from '@/components/Button';
import LogoutButton from '@/components/LogoutButton';
import { CardSkeletonGrid } from '@/components/Skeleton';
import CommissionSummary, { type CommissionSummaryData } from '@/components/CommissionSummary';
import PortalHeadline from '@/components/PortalHeadline';
import PortalJobCard, { type PortalJob } from '@/components/PortalJobCard';
import PortalReferralSection from '@/components/PortalReferralSection';
import PortalStatsCard, { type PortalStats } from '@/components/PortalStatsCard';
import PortalReviewSection from '@/components/PortalReviewSection';
import { useNewJobAlert } from '@/components/useNewJobAlert';
import { BellIcon, WrenchIcon } from '@/components/icons';


const PAST_TOP_N = 20;

export default function PartnerHomePage() {
  const [showAllPast, setShowAllPast] = useState(false);
  const { data, error } = usePolling<{ jobs: PortalJob[] }>('/api/partner/jobs', 5_000);
  const { data: statsData } = usePolling<PortalStats>('/api/partner/stats', 30_000);
  const { data: commissionData } = usePolling<CommissionSummaryData>('/api/partner/commissions', 30_000);
  const jobs = data?.jobs ?? [];
  const loading = !data && !error;

  const waiting = jobs.filter((j) => j.status === 'REQUESTED');
  // 새 배정 알림(#6) — 탭 타이틀 배지 + 새 건 도착 시 비프·진동·(허용 시) 브라우저 알림.
  const { notifPermission, enableNotifications } = useNewJobAlert({
    waitingIds: waiting.map((j) => j.id),
    ready: !!data,
    baseTitle: '업체 포털',
  });
  const inProgress = jobs
    .filter(
      (j) =>
        j.status === 'ACCEPTED' &&
        (j.request.status === 'ACCEPTED' || j.request.status === 'DISPATCHED'),
    )
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const past = jobs.filter((j) => !waiting.includes(j) && !inProgress.includes(j));
  const visiblePast = showAllPast ? past : past.slice(0, PAST_TOP_N);
  const priorHistory = (job: PortalJob) => {
    const identity = job.request.address ?? job.request.customerPhone;
    if (!identity) return [];
    const seenRequestIds = new Set<string>();
    return jobs
      .filter((candidate) => {
        const candidateIdentity = candidate.request.address ?? candidate.request.customerPhone;
        return (
          // Assignment는 requestId 유일 제약이 없는 이력 모델 — 같은 접수의 과거 배정이
          // "자기 이력"으로 잡히지 않도록 request 단위로 현재 건을 제외한다.
          candidate.request.id !== job.request.id &&
          candidateIdentity === identity &&
          Date.parse(candidate.createdAt) < Date.parse(job.createdAt) &&
          !seenRequestIds.has(candidate.request.id) &&
          (seenRequestIds.add(candidate.request.id), true)
        );
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  };

  return (
    <main className="min-h-screen bg-surface">
      <PageHeader
        title="업체 포털"
        width="max-w-5xl"
        right={
          <>
            <Link href="/partner/profile" className={buttonClasses('secondary', 'sm')}>
              내 정보
            </Link>
            <LogoutButton loginPath="/partner/login" />
          </>
        }
      />

      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:space-y-8 md:py-8">
        {/* 배너 밴드 — banner-partner.webp(banner-partner.png 변환, 블루아워 밴 플릿).
            21:9 광각이라 h-28~h-36에서도 옆으로 넓게 보이며, 우측 텍스트+좌측 그라데이션은
            tech 배너와 동일한 절제 원칙을 공유한다. */}
        <div className="relative -mx-4 h-28 w-[calc(100%+2rem)] overflow-hidden rounded-b-2xl md:mx-0 md:h-36 md:w-full md:rounded-3xl">
          <Image
            src="/images/banner-partner.webp"
            alt=""
            fill
            sizes="(min-width: 768px) 64rem, 100vw"
            style={{ objectFit: 'cover' }}
            preload={true}
          />
          <div className="absolute inset-0 bg-gradient-to-l from-brand-950/90 via-brand-950/35 to-transparent" />
          <div className="absolute inset-0 flex items-center justify-end px-5 text-right md:px-8">
            <p className="text-[15px] font-bold text-white md:text-lg">
              이번 주도 순조로운 배정 되세요
            </p>
          </div>
        </div>

        <PortalHeadline stats={statsData ?? null} commission={commissionData ?? null} />

        {error && <p className="text-sm text-red-600">{error}</p>}

        {notifPermission === 'default' && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={enableNotifications}
              className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100"
            >
              <BellIcon className="h-3.5 w-3.5" />
              새 배정 브라우저 알림 켜기
            </button>
          </div>
        )}

        <section>
          <h2 className="mb-2 flex items-center gap-1.5 font-semibold text-brand-700">
            <BellIcon className="h-4 w-4" />
            응답 대기{waiting.length > 0 && ` (${waiting.length})`}
          </h2>
          {loading ? (
            <CardSkeletonGrid count={2} />
          ) : waiting.length === 0 ? (
            <p className="rounded-xl bg-neutral-50 p-4 text-center text-sm text-muted">
              새로 배정된 건이 없습니다
            </p>
          ) : (
            <div className="space-y-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 xl:grid-cols-3">
              {waiting.map((j) => (
                <PortalJobCard
                  key={j.id}
                  job={j}
                  scope="partner"
                  highlight
                  activeQueue
                  priorHistory={priorHistory(j)}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-1.5 font-semibold">
            <WrenchIcon className="h-4 w-4 text-muted" />
            진행 중
          </h2>
          {loading ? null : inProgress.length === 0 ? (
            <p className="rounded-xl bg-neutral-50 p-4 text-center text-sm text-muted">
              진행 중인 건이 없습니다
            </p>
          ) : (
            <div className="space-y-2">
              {inProgress.map((j) => (
                <PortalJobCard
                  key={j.id}
                  job={j}
                  scope="partner"
                  activeQueue
                  timeline
                  priorHistory={priorHistory(j)}
                />
              ))}
            </div>
          )}
        </section>


        <PortalStatsCard data={statsData ?? null} />

        <CommissionSummary data={commissionData ?? null} />

        {past.length > 0 && (
          <section>
            <h2 className="mb-2 font-semibold text-muted">지난 내역</h2>
            <div className="space-y-2 opacity-70 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 xl:grid-cols-3">
              {visiblePast.map((j) => (
                <PortalJobCard key={j.id} job={j} scope="partner" priorHistory={priorHistory(j)} />
              ))}
            </div>
            {past.length > PAST_TOP_N && (
              <button
                type="button"
                onClick={() => setShowAllPast((v) => !v)}
                className="mt-2 w-full text-center text-xs font-semibold text-muted hover:underline"
              >
                {showAllPast ? '접기' : `전체 보기 (${past.length}건)`}
              </button>
            )}
          </section>
        )}

        <PortalReferralSection url="/api/partner/referrals" />

        <PortalReviewSection url="/api/partner/reviews" />
      </div>
    </main>
  );
}
