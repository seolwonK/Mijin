'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePolling } from '@/components/usePolling';
import { StatusBadge, UrgencyBadge } from '@/components/StatusBadge';
import LogoutButton from '@/components/LogoutButton';
import PageHeader from '@/components/PageHeader';
import { Skeleton, CardSkeletonGrid } from '@/components/Skeleton';

// lastUpdatedAt(마지막 성공 갱신 시각)을 "방금 확인 / n초 전 확인" 문구로 변환.
function freshnessLabel(lastUpdatedAt: number | null, now: number): string {
  if (lastUpdatedAt == null) return '확인 중…';
  const diffSec = Math.max(0, Math.floor((now - lastUpdatedAt) / 1000));
  if (diffSec < 3) return '방금 확인';
  if (diffSec < 60) return `${diffSec}초 전 확인`;
  const diffMin = Math.floor(diffSec / 60);
  return `${diffMin}분 전 확인`;
}

type Job = {
  id: string;
  status: string;
  distanceKm: number | null;
  createdAt: string;
  request: {
    id: string;
    status: string;
    urgency: string;
    description: string;
    address: string | null;
    createdAt: string;
  };
};

function JobCard({ job, highlight }: { job: Job; highlight?: boolean }) {
  return (
    <Link
      href={`/tech/jobs/${job.id}`}
      className={`block rounded-2xl border p-4 transition-shadow hover:shadow-card-hover ${
        highlight ? 'border-brand-400 bg-brand-50' : 'border-border bg-white'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <UrgencyBadge urgency={job.request.urgency} />
          <StatusBadge status={job.request.status} />
        </div>
        {job.distanceKm != null && (
          <span className="text-sm font-medium text-muted">
            {job.distanceKm.toFixed(1)}km
          </span>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-fg">{job.request.description}</p>
      {job.request.address && (
        <p className="mt-1 text-sm text-muted">📍 {job.request.address}</p>
      )}
      <p className="mt-1 text-xs text-muted">
        배정 {new Date(job.createdAt).toLocaleString('ko-KR')}
      </p>
    </Link>
  );
}

export default function TechHomePage() {
  const { data, error, refresh, lastUpdatedAt } = usePolling<{ jobs: Job[] }>(
    '/api/tech/jobs',
    5_000,
  );
  const { data: contractData } = usePolling<{ contract: { status: string } }>(
    '/api/tech/contract',
    30_000,
  );
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
  const inProgress = jobs.filter(
    (j) =>
      j.status === 'ACCEPTED' &&
      (j.request.status === 'ACCEPTED' || j.request.status === 'DISPATCHED'),
  );
  const past = jobs.filter((j) => !waiting.includes(j) && !inProgress.includes(j));

  return (
    <main className="min-h-screen">
      <PageHeader
        title="기술자 포털"
        width="max-w-5xl"
        right={<LogoutButton loginPath="/tech/login" />}
      />

      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:space-y-8 md:py-8">
        <div className="flex items-center justify-end gap-1 text-xs text-muted">
          <span>{freshnessLabel(lastUpdatedAt, now)}</span>
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={manualRefreshing}
            aria-label="새로고침"
            className={`flex h-11 w-11 items-center justify-center rounded-full text-base text-muted transition-colors hover:bg-neutral-100 active:bg-neutral-200 disabled:opacity-50 ${manualRefreshing ? 'animate-spin' : ''}`}
          >
            🔄
          </button>
        </div>

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
            <span className="min-w-0">
              <span
                className={`block font-bold ${contractSigned ? 'text-green-800' : 'text-amber-800'}`}
              >
                📄 근로계약서 {contractSigned ? '서명 완료' : '작성 필요'}
              </span>
              {!contractSigned && (
                <span className="mt-0.5 block text-xs text-amber-700">
                  서명을 완료해야 배정(일)을 받을 수 있습니다.
                </span>
              )}
            </span>
            <span
              className={`shrink-0 text-sm ${contractSigned ? 'text-green-600' : 'text-amber-600'}`}
            >
              {contractSigned ? '보기 →' : '작성하기 →'}
            </span>
          </Link>
        )}

        <section>
          <h2 className="mb-2 font-semibold text-brand-700">
            🔔 응답 대기 {waiting.length > 0 && `(${waiting.length})`}
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
                <JobCard key={j.id} job={j} highlight />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 font-semibold">🔧 진행중</h2>
          {loading ? null : inProgress.length === 0 ? (
            <p className="rounded-xl bg-neutral-50 p-4 text-center text-sm text-muted">
              진행중인 건이 없습니다
            </p>
          ) : (
            <div className="space-y-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 xl:grid-cols-3">
              {inProgress.map((j) => (
                <JobCard key={j.id} job={j} />
              ))}
            </div>
          )}
        </section>

        {past.length > 0 && (
          <section>
            <h2 className="mb-2 font-semibold text-muted">지난 내역</h2>
            <div className="space-y-2 opacity-70 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 xl:grid-cols-3">
              {past.slice(0, 20).map((j) => (
                <JobCard key={j.id} job={j} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
