'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { usePolling } from '@/components/usePolling';
import { StatusBadge, UrgencyBadge } from '@/components/StatusBadge';

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

export default function PartnerJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: job, error, refresh } = usePolling<JobDetail>(
    `/api/partner/jobs/${id}`,
    8_000,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  async function act(path: string, body?: unknown) {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/partner/jobs/${id}/${path}`, {
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
      await refresh();
    } catch {
      setActionError('네트워크 오류가 발생했습니다');
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <main className="p-6">
        <p className="text-red-600">{error}</p>
      </main>
    );
  }
  if (!job) {
    return (
      <main className="p-6 text-center text-gray-400">불러오는 중…</main>
    );
  }

  const r = job.request;
  const canRespond = job.status === 'REQUESTED';
  const canDispatch = job.status === 'ACCEPTED' && r.status === 'ACCEPTED';
  const canComplete = job.status === 'ACCEPTED' && r.status === 'DISPATCHED';

  return (
    <main className="min-h-screen pb-40">
      <header className="flex items-center gap-3 border-b border-gray-200 p-4">
        <Link href="/partner" className="text-xl">
          ←
        </Link>
        <h1 className="text-lg font-bold">배정 상세</h1>
      </header>

      <div className="space-y-4 p-4">
        <div className="flex items-center gap-1">
          <UrgencyBadge urgency={r.urgency} />
          <StatusBadge status={r.status} />
          {job.distanceKm != null && (
            <span className="ml-auto text-sm text-gray-500">
              {job.distanceKm.toFixed(1)}km
            </span>
          )}
        </div>

        <section className="rounded-2xl border border-gray-200 p-4">
          <h2 className="mb-1 text-sm text-gray-500">고장 내용</h2>
          <p className="whitespace-pre-wrap">{r.description}</p>
          <p className="mt-2 text-xs text-gray-400">
            접수 {new Date(r.createdAt).toLocaleString('ko-KR')}
          </p>
        </section>

        <section className="rounded-2xl border border-gray-200 p-4">
          <h2 className="mb-1 text-sm text-gray-500">위치</h2>
          <p>{r.address ?? '주소 미확인'}</p>
          {r.lat != null && r.lng != null && (
            <a
              href={`https://map.kakao.com/link/map/고객위치,${r.lat},${r.lng}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block rounded-lg bg-yellow-400 px-3 py-1.5 text-sm font-bold text-gray-900"
            >
              🗺 카카오맵에서 보기
            </a>
          )}
        </section>

        <section className="rounded-2xl border border-gray-200 p-4">
          <h2 className="mb-1 text-sm text-gray-500">고객</h2>
          <div className="flex items-center justify-between">
            <span className="font-bold">{r.customerName}</span>
            <a
              href={`tel:${r.customerPhone}`}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-bold text-white"
            >
              📞 {r.customerPhone}
            </a>
          </div>
        </section>

        {job.status === 'REJECTED' && (
          <p className="rounded-xl bg-gray-100 p-3 text-sm text-gray-600">
            거절한 배정입니다{job.rejectReason ? ` — ${job.rejectReason}` : ''}
          </p>
        )}
        {actionError && (
          <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">
            {actionError}
          </p>
        )}
      </div>

      {(canRespond || canDispatch || canComplete) && (
        <div className="fixed bottom-0 left-1/2 w-full max-w-md -translate-x-1/2 space-y-2 border-t border-gray-200 bg-white p-4">
          {canRespond && !rejecting && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => act('accept')}
                disabled={busy}
                className="h-14 flex-[2] rounded-2xl bg-blue-600 text-lg font-bold text-white disabled:opacity-60"
              >
                ✅ 수락하기
              </button>
              <button
                type="button"
                onClick={() => setRejecting(true)}
                disabled={busy}
                className="h-14 flex-1 rounded-2xl border border-gray-300 font-bold text-gray-600 disabled:opacity-60"
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
                className="w-full rounded-xl border border-gray-300 p-3 text-base focus:border-blue-500 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => act('reject', { reason: reason || null })}
                  disabled={busy}
                  className="h-12 flex-1 rounded-2xl bg-red-600 font-bold text-white disabled:opacity-60"
                >
                  거절 확정
                </button>
                <button
                  type="button"
                  onClick={() => setRejecting(false)}
                  disabled={busy}
                  className="h-12 flex-1 rounded-2xl border border-gray-300 font-bold text-gray-600"
                >
                  취소
                </button>
              </div>
            </div>
          )}
          {canDispatch && (
            <button
              type="button"
              onClick={() => act('status', { status: 'DISPATCHED' })}
              disabled={busy}
              className="h-14 w-full rounded-2xl bg-amber-500 text-lg font-bold text-white disabled:opacity-60"
            >
              🚚 출동 시작
            </button>
          )}
          {canComplete && (
            <button
              type="button"
              onClick={() => act('status', { status: 'COMPLETED' })}
              disabled={busy}
              className="h-14 w-full rounded-2xl bg-green-600 text-lg font-bold text-white disabled:opacity-60"
            >
              ✅ 완료 처리
            </button>
          )}
        </div>
      )}
    </main>
  );
}
