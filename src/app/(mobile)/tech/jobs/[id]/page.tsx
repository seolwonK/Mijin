'use client';

import { use, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { buttonClasses } from '@/components/Button';
import { usePolling } from '@/components/usePolling';
import { StatusPill, UrgencyPill } from '@/components/StatusPill';
import { surfaceClasses } from '@/components/Surface';
import { Skeleton, CardSkeleton } from '@/components/Skeleton';
import ResponseDeadlineNote from '@/components/ResponseDeadlineNote';
import { MapPinIcon, PhoneIcon, CheckIcon, TruckIcon } from '@/components/icons';

type JobDetail = {
  id: string;
  status: string;
  distanceKm: number | null;
  rejectReason: string | null;
  createdAt: string;
  request: {
    id: string;
    status: string;
    urgency: string;
    description: string;
    address: string | null;
    lat: number | null;
    lng: number | null;
    customerName: string;
    customerPhone: string;
    createdAt: string;
  };
};

export default function TechJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: job, error, refresh } = usePolling<JobDetail>(
    `/api/tech/jobs/${id}`,
    8_000,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  // 되돌릴 수 없는 액션(출동/완료)은 2단계 확인. flash 는 처리 후 잠깐 뜨는 성공 안내.
  const [confirming, setConfirming] = useState<'DISPATCHED' | 'COMPLETED' | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function act(path: string, body?: unknown, successMsg?: string) {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/tech/jobs/${id}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : '{}',
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? '처리에 실패했습니다');
        return;
      }
      setRejecting(false);
      setConfirming(null);
      if (successMsg) {
        setFlash(successMsg);
        setTimeout(() => setFlash(null), 3000);
      }
      await refresh();
    } catch {
      setActionError('네트워크 오류가 발생했습니다');
    } finally {
      setBusy(false);
    }
  }

  if (error || !job) {
    return (
      <main className="min-h-screen">
        <PageHeader title="배정 상세" back="/tech" width="max-w-3xl" />
        <div className="mx-auto w-full max-w-3xl space-y-4 p-4 md:py-8">
          {error ? (
            <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-600">
              불러오지 못했습니다 — {error}
            </p>
          ) : (
            <>
              <Skeleton className="h-8 w-40" />
              <CardSkeleton />
              <CardSkeleton />
            </>
          )}
        </div>
      </main>
    );
  }

  const r = job.request;
  const canRespond = job.status === 'REQUESTED';
  const canDispatch = job.status === 'ACCEPTED' && r.status === 'ACCEPTED';
  const canComplete = job.status === 'ACCEPTED' && r.status === 'DISPATCHED';

  return (
    <main className="min-h-screen pb-40 md:pb-16">
      <PageHeader title="배정 상세" back="/tech" width="max-w-3xl" />

      <div className="mx-auto w-full max-w-3xl space-y-4 p-4 md:grid md:grid-cols-2 md:items-start md:gap-4 md:space-y-0 md:py-8">
        <div className="flex items-center gap-2 md:col-span-2">
          <UrgencyPill urgency={r.urgency} />
          <StatusPill status={r.status} />
          {job.distanceKm != null && (
            <span className="ml-auto text-sm text-muted">
              {job.distanceKm.toFixed(1)}km
            </span>
          )}
        </div>
        {canRespond && <ResponseDeadlineNote assignedAt={job.createdAt} urgency={r.urgency} />}

        <section className={surfaceClasses('rounded-2xl p-4 md:col-span-2 md:p-5')}>
          <h2 className="mb-1 text-sm text-muted">고장 내용</h2>
          <p className="whitespace-pre-wrap text-fg">{r.description}</p>
          <p className="mt-2 text-xs text-neutral-400">
            접수 {new Date(r.createdAt).toLocaleString('ko-KR')}
          </p>
        </section>

        <section className={surfaceClasses('rounded-2xl p-4 md:p-5')}>
          <h2 className="mb-1 text-sm text-muted">위치</h2>
          <p className="text-fg">{r.address ?? '주소 미확인'}</p>
          {r.lat != null && r.lng != null && (
            <div className="mt-2 flex flex-wrap gap-2">
              <a
                href={`https://map.kakao.com/link/map/고객위치,${r.lat},${r.lng}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-yellow-400 px-3 py-1.5 text-sm font-bold text-neutral-900"
              >
                <MapPinIcon className="h-4 w-4" />
                지도 보기
              </a>
              <a
                href={`https://map.kakao.com/link/to/고객위치,${r.lat},${r.lng}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-yellow-400 px-3 py-1.5 text-sm font-bold text-neutral-900"
              >
                <TruckIcon className="h-4 w-4" />
                길찾기
              </a>
            </div>
          )}
        </section>

        <section className={surfaceClasses('rounded-2xl p-4 md:p-5')}>
          <h2 className="mb-1 text-sm text-muted">고객</h2>
          <div className="flex items-center justify-between">
            <span className="font-bold text-fg">{r.customerName}</span>
            <a
              href={`tel:${r.customerPhone}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-bold text-white"
            >
              <PhoneIcon className="h-4 w-4" />
              {r.customerPhone}
            </a>
          </div>
        </section>

        {job.status === 'REJECTED' && (
          <p className="rounded-xl bg-neutral-100 p-3 text-sm text-neutral-600 md:col-span-2">
            거절한 배정입니다{job.rejectReason ? ` — ${job.rejectReason}` : ''}
          </p>
        )}
        {flash && (
          <p className="flex items-center gap-1.5 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700 md:col-span-2">
            <CheckIcon className="h-4 w-4 shrink-0" />
            {flash}
          </p>
        )}
        {actionError && (
          <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-600 md:col-span-2">
            {actionError}
          </p>
        )}
      </div>

      {(canRespond || canDispatch || canComplete) && (
        <div className="fixed bottom-0 left-1/2 w-full max-w-md -translate-x-1/2 space-y-2 bg-white px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-surface-lg md:static md:left-auto md:mx-auto md:max-w-3xl md:translate-x-0 md:bg-transparent md:px-4 md:pt-2 md:pb-0 md:shadow-none">
          {canRespond && !rejecting && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => act('accept')}
                disabled={busy}
                className={buttonClasses('primary', 'lg', 'flex-[2]')}
              >
                <CheckIcon className="h-5 w-5" />
                수락하기
              </button>
              <button
                type="button"
                onClick={() => setRejecting(true)}
                disabled={busy}
                className={buttonClasses('secondary', 'lg', 'flex-1')}
              >
                거절
              </button>
            </div>
          )}
          {canRespond && rejecting && (
            <div className="space-y-2">
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="거절 사유 (선택)"
                className="w-full rounded-xl border border-neutral-300 bg-white p-3 text-base text-fg placeholder:text-muted focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => act('reject', { reason: reason || null })}
                  disabled={busy}
                  className={buttonClasses('danger', 'md', 'flex-1')}
                >
                  거절 확정
                </button>
                <button
                  type="button"
                  onClick={() => setRejecting(false)}
                  disabled={busy}
                  className={buttonClasses('secondary', 'md', 'flex-1')}
                >
                  취소
                </button>
              </div>
            </div>
          )}
          {canDispatch &&
            (confirming === 'DISPATCHED' ? (
              <div className="space-y-2">
                <p className="text-center text-sm font-medium text-neutral-600">
                  출동을 시작할까요?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => act('status', { status: 'DISPATCHED' }, '출동을 시작했습니다')}
                    disabled={busy}
                    className="h-12 flex-1 rounded-2xl bg-teal-600 font-bold text-white disabled:opacity-60"
                  >
                    출동 시작
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    disabled={busy}
                    className={buttonClasses('secondary', 'md', 'flex-1')}
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming('DISPATCHED')}
                disabled={busy}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-teal-600 text-lg font-bold text-white disabled:opacity-60"
              >
                <TruckIcon className="h-5 w-5" />
                출동 시작
              </button>
            ))}
          {canComplete &&
            (confirming === 'COMPLETED' ? (
              <div className="space-y-2">
                <p className="text-center text-sm font-medium text-neutral-600">
                  완료 처리할까요? 되돌릴 수 없습니다.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => act('status', { status: 'COMPLETED' }, '완료 처리했습니다')}
                    disabled={busy}
                    className="h-12 flex-1 rounded-2xl bg-emerald-600 font-bold text-white disabled:opacity-60"
                  >
                    완료 확정
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    disabled={busy}
                    className={buttonClasses('secondary', 'md', 'flex-1')}
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming('COMPLETED')}
                disabled={busy}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-lg font-bold text-white disabled:opacity-60"
              >
                <CheckIcon className="h-5 w-5" />
                완료 처리
              </button>
            ))}
        </div>
      )}
    </main>
  );
}
