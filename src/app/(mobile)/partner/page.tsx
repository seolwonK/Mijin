'use client';

import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { usePolling } from '@/components/usePolling';
import { StatusBadge, UrgencyBadge } from '@/components/StatusBadge';
import LogoutButton from '@/components/LogoutButton';
import { CardSkeletonGrid } from '@/components/Skeleton';

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
      href={`/partner/jobs/${job.id}`}
      className={`block rounded-2xl border p-4 transition-shadow hover:shadow-md ${
        highlight ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <UrgencyBadge urgency={job.request.urgency} />
          <StatusBadge status={job.request.status} />
        </div>
        {job.distanceKm != null && (
          <span className="text-sm font-medium text-gray-500">
            {job.distanceKm.toFixed(1)}km
          </span>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-gray-800">{job.request.description}</p>
      {job.request.address && (
        <p className="mt-1 text-sm text-gray-500">📍 {job.request.address}</p>
      )}
      <p className="mt-1 text-xs text-gray-500">
        배정 {new Date(job.createdAt).toLocaleString('ko-KR')}
      </p>
    </Link>
  );
}

export default function PartnerHomePage() {
  const { data, error } = usePolling<{ jobs: Job[] }>('/api/partner/jobs', 5_000);
  const jobs = data?.jobs ?? [];
  const loading = !data && !error;

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
        title="업체 포털"
        width="max-w-5xl"
        right={
          <>
            <Link
              href="/partner/profile"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              내 정보
            </Link>
            <LogoutButton loginPath="/partner/login" />
          </>
        }
      />

      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:space-y-8 md:py-8">
        {error && <p className="text-sm text-red-600">{error}</p>}

        <section>
          <h2 className="mb-2 font-semibold text-blue-700">
            🔔 응답 대기 {waiting.length > 0 && `(${waiting.length})`}
          </h2>
          {loading ? (
            <CardSkeletonGrid count={2} />
          ) : waiting.length === 0 ? (
            <p className="rounded-xl bg-gray-50 p-4 text-center text-sm text-gray-500">
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
            <p className="rounded-xl bg-gray-50 p-4 text-center text-sm text-gray-500">
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
            <h2 className="mb-2 font-semibold text-gray-500">지난 내역</h2>
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
