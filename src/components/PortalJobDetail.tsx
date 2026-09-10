'use client';

import { useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { usePolling } from '@/components/usePolling';
import {
  StatusPill,
  UrgencyPill,
  portalJobStatus,
} from '@/components/StatusPill';
import Surface from '@/components/Surface';
import { buttonClasses } from '@/components/Button';
import PortalLoadState from '@/components/PortalLoadState';
import { readApiJson, requestError } from '@/lib/clientApi';
import ResponseDeadlineNote from '@/components/ResponseDeadlineNote';
import { EggIcon } from '@/components/EggIcon';
import {
  CheckIcon,
  MapPinIcon,
  PhoneIcon,
  TruckIcon,
} from '@/components/icons';
import PhotoGallery, { type RequestPhotoRef } from '@/components/PhotoGallery';

type JobDetail = {
  id: string;
  status: string;
  distanceKm: number | null;
  rejectReason: string | null;
  respondedAt?: string | null;
  createdAt: string;
  request: {
    id: string;
    status: string;
    urgency: string;
    description: string;
    photos: RequestPhotoRef[];
    address: string | null;
    lat: number | null;
    lng: number | null;
    customerName: string;
    customerPhone: string;
    createdAt: string;
  };
};

export default function PortalJobDetail({
  id,
  scope,
}: {
  id: string;
  scope: 'partner' | 'tech';
}) {
  const {
    data: job,
    error,
    refresh,
  } = usePolling<JobDetail>(`/api/${scope}/jobs/${id}`, 8_000);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  // 되돌릴 수 없는 액션(출동/완료)은 2단계 확인. flash 는 처리 후 잠깐 뜨는 성공 안내.
  const [confirming, setConfirming] = useState<
    'DISPATCHED' | 'COMPLETED' | null
  >(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function act(path: string, body?: unknown, successMsg?: string) {
    setBusy(true);
    setActionError(null);
    try {
      if (error)
        throw new Error('새로고침 후 최신 상태에서 다시 시도해 주세요.');
      const res = await fetch(`/api/${scope}/jobs/${id}/${path}`, {
        method: 'POST',
        signal: AbortSignal.timeout(15_000),
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : '{}',
      });
      await readApiJson(res);
      setRejecting(false);
      setConfirming(null);
      if (successMsg) {
        setFlash(successMsg);
        setTimeout(() => setFlash(null), 3000);
      }
      await refresh();
    } catch (e) {
      setActionError(requestError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!job)
    return (
      <main className="min-h-screen">
        <PageHeader title="배정 상세" back={`/${scope}`} width="max-w-3xl" />
        <div className="mx-auto max-w-3xl p-4">
          <PortalLoadState
            label="배정 상세"
            error={error}
            loading={!error}
            retry={refresh}
          />
        </div>
      </main>
    );

  const r = job.request;
  const canRespond = job.status === 'REQUESTED';
  const canDispatch = job.status === 'ACCEPTED' && r.status === 'ACCEPTED';
  const canComplete = job.status === 'ACCEPTED' && r.status === 'DISPATCHED';

  return (
    <main className="min-h-screen pb-40 md:pb-16">
      <PageHeader title="배정 상세" back={`/${scope}`} width="max-w-3xl" />

      <div className="mx-auto w-full max-w-3xl space-y-4 p-4 md:grid md:grid-cols-2 md:items-start md:gap-4 md:space-y-0 md:py-8">
        <div className="flex items-center gap-2 md:col-span-2">
          <UrgencyPill urgency={r.urgency} />
          <StatusPill status={portalJobStatus(job.status, r.status)} />
          {job.distanceKm != null && (
            <span className="ml-auto text-sm text-muted">
              {job.distanceKm.toFixed(1)}km
            </span>
          )}
        </div>
        <div className="md:col-span-2">
          <PortalLoadState
            label="배정 상세"
            error={error}
            retry={refresh}
            stale
          />
        </div>
        {canRespond && (
          <ResponseDeadlineNote
            assignedAt={job.createdAt}
            urgency={r.urgency}
          />
        )}

        <Surface as="section" className="rounded-2xl p-4 md:col-span-2 md:p-5">
          <h2 className="mb-1 text-sm text-muted">고장 내용</h2>
          <p className="whitespace-pre-wrap">{r.description}</p>
          <PhotoGallery
            requestId={r.id}
            photos={r.photos ?? []}
            className="mt-3"
          />
          <p className="mt-2 text-xs text-muted">
            접수 {new Date(r.createdAt).toLocaleString('ko-KR')}
          </p>
        </Surface>

        <Surface as="section" className="rounded-2xl p-4 md:p-5">
          <h2 className="mb-1 text-sm text-muted">위치</h2>
          <p>{r.address ?? '주소 미확인'}</p>
          {r.lat != null && r.lng != null && (
            <div className="mt-2 flex flex-wrap gap-2">
              <a
                href={`https://map.kakao.com/link/map/고객위치,${r.lat},${r.lng}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-yellow-400 px-4 py-2 text-sm font-bold text-neutral-900"
              >
                <MapPinIcon className="h-4 w-4" />
                지도 보기
              </a>
              <a
                href={`https://map.kakao.com/link/to/고객위치,${r.lat},${r.lng}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-yellow-400 px-4 py-2 text-sm font-bold text-neutral-900"
              >
                <TruckIcon className="h-4 w-4" />
                길찾기
              </a>
            </div>
          )}
        </Surface>

        <Surface as="section" className="rounded-2xl p-4 md:p-5">
          <h2 className="mb-1 text-sm text-muted">고객</h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-bold">{r.customerName}</span>
            <a
              href={`tel:${r.customerPhone}`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white"
            >
              <PhoneIcon className="h-4 w-4" />
              {r.customerPhone}
            </a>
          </div>
        </Surface>

        {job.status === 'REJECTED' && (
          <p className="rounded-xl bg-neutral-100 p-3 text-sm text-neutral-600 md:col-span-2">
            거절한 배정입니다{job.rejectReason ? ` — ${job.rejectReason}` : ''}
          </p>
        )}
        {job.status === 'EXPIRED' && (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 md:col-span-2">
            응답 기한이 지나 회수된 배정입니다. 이 배정에는 더 이상 응답할 수
            없습니다.
          </p>
        )}
        {job.status === 'CANCELED' && (
          <p className="rounded-xl bg-neutral-100 p-3 text-sm md:col-span-2">
            취소된 배정입니다. 진행할 작업이 있는지는 목록에서 확인해 주세요.
          </p>
        )}
        {job.respondedAt && (
          <p className="text-sm text-muted md:col-span-2">
            {job.status === 'EXPIRED' || job.status === 'CANCELED'
              ? '배정 종료'
              : '배정 응답'}{' '}
            {new Date(job.respondedAt).toLocaleString('ko-KR')}
          </p>
        )}
        {flash && (
          <p
            role="status"
            className="flex items-center gap-1.5 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700 md:col-span-2"
          >
            <CheckIcon className="h-4 w-4 shrink-0" />
            {flash}
          </p>
        )}
        {actionError && !(canRespond || canDispatch || canComplete) && (
          <p
            role="alert"
            className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600 md:col-span-2"
          >
            {actionError}
          </p>
        )}
      </div>

      {(canRespond || canDispatch || canComplete) && (
        <div className="fixed bottom-0 left-1/2 w-full max-w-md -translate-x-1/2 space-y-2 bg-white px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-surface-lg md:static md:left-auto md:mx-auto md:max-w-3xl md:translate-x-0 md:bg-transparent md:px-4 md:pt-2 md:pb-0 md:shadow-none">
          {actionError && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
            >
              {actionError}
            </p>
          )}
          {error && (
            <p role="status" className="text-sm text-amber-900">
              최신 상태를 확인한 뒤 처리할 수 있습니다. 위의 다시 시도를 눌러
              주세요.
            </p>
          )}
          {canRespond && !rejecting && (
            <>
              <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
                <EggIcon size={14} />
                수락하면 알 1개가 차감됩니다 (잔액이 없으면 차감 없이 수락)
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => act('accept')}
                  disabled={busy || !!error}
                  className={buttonClasses('primary', 'lg', 'flex-[2] gap-2')}
                >
                  <CheckIcon className="h-5 w-5" />
                  수락하기
                </button>
                <button
                  type="button"
                  onClick={() => setRejecting(true)}
                  disabled={busy || !!error}
                  className={buttonClasses('secondary', 'lg', 'flex-1')}
                >
                  거절
                </button>
              </div>
            </>
          )}
          {canRespond && rejecting && (
            <div className="space-y-2">
              <label
                htmlFor="reject-reason"
                className="block text-sm font-semibold"
              >
                거절 사유 (선택)
              </label>
              <input
                id="reject-reason"
                autoFocus
                maxLength={200}
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="거절 사유 (선택)"
                className="w-full rounded-xl border border-border p-3 text-base focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => act('reject', { reason: reason || null })}
                  disabled={busy || !!error}
                  className={buttonClasses('danger', 'md', 'flex-1')}
                >
                  거절 확정
                </button>
                <button
                  type="button"
                  onClick={() => setRejecting(false)}
                  disabled={busy || !!error}
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
                    onClick={() =>
                      act(
                        'status',
                        { status: 'DISPATCHED' },
                        '출동을 시작했습니다',
                      )
                    }
                    disabled={busy || !!error}
                    className="h-12 flex-1 rounded-2xl bg-teal-700 font-bold text-white disabled:opacity-60"
                  >
                    출동 시작
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    disabled={busy || !!error}
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
                disabled={busy || !!error}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-teal-700 text-lg font-bold text-white disabled:opacity-60"
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
                    onClick={() =>
                      act(
                        'status',
                        { status: 'COMPLETED' },
                        '완료 처리했습니다',
                      )
                    }
                    disabled={busy || !!error}
                    className="h-12 flex-1 rounded-2xl bg-emerald-700 font-bold text-white disabled:opacity-60"
                  >
                    완료 확정
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    disabled={busy || !!error}
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
                disabled={busy || !!error}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 text-lg font-bold text-white disabled:opacity-60"
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
