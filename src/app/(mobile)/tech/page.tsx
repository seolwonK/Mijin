'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePolling } from '@/components/usePolling';
import LogoutButton from '@/components/LogoutButton';
import PageHeader from '@/components/PageHeader';
import { Skeleton, CardSkeletonGrid } from '@/components/Skeleton';
import CommissionSummary, { type CommissionSummaryData } from '@/components/CommissionSummary';
import PortalReferralSection from '@/components/PortalReferralSection';
import PortalStatsCard, { type PortalStats } from '@/components/PortalStatsCard';
import PortalReviewSection from '@/components/PortalReviewSection';
import PortalHeadline from '@/components/PortalHeadline';
import PortalJobCard, { type PortalJob } from '@/components/PortalJobCard';
import { useNewJobAlert } from '@/components/useNewJobAlert';
import { BellIcon, WrenchIcon, ClipboardIcon, RefreshIcon } from '@/components/icons';

// lastUpdatedAt(마지막 성공 갱신 시각)을 "방금 확인 / n초 전 확인" 문구로 변환.
function freshnessLabel(lastUpdatedAt: number | null, now: number): string {
  if (lastUpdatedAt == null) return '확인 중…';
  const diffSec = Math.max(0, Math.floor((now - lastUpdatedAt) / 1000));
  if (diffSec < 3) return '방금 확인';
  if (diffSec < 60) return `${diffSec}초 전 확인`;
  const diffMin = Math.floor(diffSec / 60);
  return `${diffMin}분 전 확인`;
}


const PAST_TOP_N = 20;

export default function TechHomePage() {
  const [showAllPast, setShowAllPast] = useState(false);
  const { data, error, refresh, lastUpdatedAt } = usePolling<{ jobs: PortalJob[] }>(
    '/api/tech/jobs',
    5_000,
  );
  const { data: contractData } = usePolling<{ contract: { status: string } }>(
    '/api/tech/contract',
    30_000,
  );
  const { data: statsData } = usePolling<PortalStats>('/api/tech/stats', 30_000);
  const { data: commissionData } = usePolling<CommissionSummaryData>('/api/tech/commissions', 30_000);
  const contractSigned = contractData?.contract?.status === 'CONFIRMED';
  const contractLoading = !contractData;
  const jobs = data?.jobs ?? [];
  const loading = !data && !error;

  // "n초 전 확인" 문구가 1초 간격으로 갱신되도록 하는 틱.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const [manualRefreshing, setManualRefreshing] = useState(false);
  async function handleManualRefresh() {
    setManualRefreshing(true);
    try {
      await refresh();
    } finally {
      setManualRefreshing(false);
    }
  }

  const waiting = jobs.filter((j) => j.status === 'REQUESTED');
  // 새 배정 알림(#6) — 탭 타이틀 배지 + 새 건 도착 시 비프·진동·(허용 시) 브라우저 알림.
  const { notifPermission, enableNotifications } = useNewJobAlert({
    waitingIds: waiting.map((j) => j.id),
    ready: !!data,
    baseTitle: '기술자 포털',
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
        title="기술자 포털"
        width="max-w-5xl"
        right={<LogoutButton loginPath="/tech/login" />}
      />

      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:space-y-8 md:py-8">
        {/* 배너 밴드 — banner-tech.webp(hero-3-flatlay.png 변환, 공구 플랫레이). 이미지
            우측의 여백에 텍스트를 얹고, 좌측 공구는 그대로 드러나도록 그라데이션은
            우측에서 좌측으로 옅어진다(관제탑 밴드와 같은 절제 원칙, 텍스트는 한 줄만). */}
        <div className="relative -mx-4 h-28 w-[calc(100%+2rem)] overflow-hidden rounded-b-2xl md:mx-0 md:h-36 md:w-full md:rounded-3xl">
          <Image
            src="/images/banner-tech.webp"
            alt=""
            fill
            sizes="(min-width: 768px) 64rem, 100vw"
            style={{ objectFit: 'cover' }}
            preload={true}
          />
          <div className="absolute inset-0 bg-gradient-to-l from-brand-950/90 via-brand-950/35 to-transparent" />
          <div className="absolute inset-0 flex items-center justify-end px-5 text-right md:px-8">
            <p className="text-[15px] font-bold text-white md:text-lg">
              오늘도 안전한 출동 되세요
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-1 text-xs text-muted">
          {notifPermission === 'default' && (
            <button
              type="button"
              onClick={enableNotifications}
              className="mr-auto inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1.5 font-semibold text-brand-700 transition-colors hover:bg-brand-100"
            >
              <BellIcon className="h-3.5 w-3.5" />
              새 배정 브라우저 알림 켜기
            </button>
          )}
          <span>{freshnessLabel(lastUpdatedAt, now)}</span>
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={manualRefreshing}
            aria-label="새로고침"
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-neutral-100 active:bg-neutral-200 disabled:opacity-50"
          >
            <RefreshIcon className={`h-[18px] w-[18px] ${manualRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <PortalHeadline stats={statsData ?? null} commission={commissionData ?? null} />

        {error && <p className="text-sm text-red-600">{error}</p>}

        {contractLoading ? (
          <div className="flex items-center justify-between rounded-2xl border border-border bg-neutral-50 p-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-12" />
          </div>
        ) : (
          <Link
            href="/tech/contract"
            className={`flex items-center justify-between rounded-2xl border p-4 transition-colors ${
              contractSigned
                ? 'border-green-200 bg-green-50 hover:bg-green-100'
                : 'border-amber-300 bg-amber-50 hover:bg-amber-100'
            }`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <ClipboardIcon
                className={`h-5 w-5 shrink-0 ${contractSigned ? 'text-green-700' : 'text-amber-700'}`}
              />
              <span className="min-w-0">
                <span
                  className={`block font-bold ${contractSigned ? 'text-green-800' : 'text-amber-800'}`}
                >
                  근로계약서 {contractSigned ? '서명 완료' : '작성 필요'}
                </span>
                {!contractSigned && (
                  <span className="mt-0.5 block text-xs text-amber-700">
                    서명을 완료해야 배정(일)을 받을 수 있습니다.
                  </span>
                )}
              </span>
            </span>
            <span
              className={`shrink-0 text-sm ${contractSigned ? 'text-green-600' : 'text-amber-600'}`}
            >
              {contractSigned ? '보기 →' : '작성하기 →'}
            </span>
          </Link>
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
                  scope="tech"
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
            <WrenchIcon className="h-4 w-4" />
            진행 중
          </h2>
          {loading ? null : inProgress.length === 0 ? (
            <p className="rounded-xl bg-neutral-50 p-4 text-center text-sm text-muted">
              진행중인 건이 없습니다
            </p>
          ) : (
            <div className="space-y-2">
              {inProgress.map((j) => (
                <PortalJobCard
                  key={j.id}
                  job={j}
                  scope="tech"
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
                <PortalJobCard key={j.id} job={j} scope="tech" priorHistory={priorHistory(j)} />
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

        <PortalReferralSection url="/api/tech/referrals" />

        <PortalReviewSection url="/api/tech/reviews" />
      </div>
    </main>
  );
}
