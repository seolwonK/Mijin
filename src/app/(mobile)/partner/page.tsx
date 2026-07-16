'use client';

import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { usePolling } from '@/components/usePolling';
import { StatusPill, UrgencyPill } from '@/components/StatusPill';
import Surface from '@/components/Surface';
import { buttonClasses } from '@/components/Button';
import LogoutButton from '@/components/LogoutButton';
import { CardSkeletonGrid } from '@/components/Skeleton';
import CommissionSummary from '@/components/CommissionSummary';
import { BellIcon, WrenchIcon, MapPinIcon } from '@/components/icons';

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
    <Surface
      as="section"
      tint={highlight}
      className="rounded-2xl transition-transform hover:-translate-y-0.5 active:translate-y-0"
    >
      <Link href={`/partner/jobs/${job.id}`} className="block p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UrgencyPill urgency={job.request.urgency} />
            <StatusPill status={job.request.status} />
          </div>
          {job.distanceKm != null && (
            <span className="text-sm font-medium text-muted">
              {job.distanceKm.toFixed(1)}km
            </span>
          )}
        </div>
        <p className="mt-2 line-clamp-2 text-sm text-fg">{job.request.description}</p>
        {job.request.address && (
          <p className="mt-1 flex items-center gap-1 text-sm text-muted">
            <MapPinIcon className="h-3.5 w-3.5 shrink-0" />
            {job.request.address}
          </p>
        )}
        <p className="mt-1 text-xs text-muted">
          배정 {new Date(job.createdAt).toLocaleString('ko-KR')}
        </p>
      </Link>
    </Surface>
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
            <Link href="/partner/profile" className={buttonClasses('secondary', 'sm')}>
              내 정보
            </Link>
            <LogoutButton loginPath="/partner/login" />
          </>
        }
      />

      <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:space-y-8 md:py-8">
        {error && <p className="text-sm text-red-600">{error}</p>}

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
                <JobCard key={j.id} job={j} highlight />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-1.5 font-semibold">
            <WrenchIcon className="h-4 w-4 text-muted" />
            진행중
          </h2>
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

        <CommissionSummary url="/api/partner/commissions" />
      </div>
    </main>
  );
}
