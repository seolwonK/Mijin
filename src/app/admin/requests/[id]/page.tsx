'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { usePolling } from '@/components/usePolling';
import { StatusBadge, UrgencyBadge } from '@/components/StatusBadge';

type AssignmentRow = {
  id: string;
  status: string;
  assignedBy: string;
  distanceKm: number | null;
  rejectReason: string | null;
  respondedAt: string | null;
  createdAt: string;
  provider: { name: string; phone: string };
};

type RequestDetail = {
  id: string;
  lookupCode: string;
  customerName: string;
  customerPhone: string;
  description: string;
  hasVoice: boolean;
  voiceTranscript: string | null;
  urgency: string;
  status: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
  needsAttention: boolean;
  createdAt: string;
  assignments: AssignmentRow[];
};

type Candidate = {
  providerId: string;
  name: string;
  phone: string;
  address: string;
  distanceKm: number | null;
  rejectedThisRequest: boolean;
};

const ASSIGNMENT_STATUS_LABEL: Record<string, string> = {
  REQUESTED: '응답 대기',
  ACCEPTED: '수락',
  REJECTED: '거절',
  CANCELED: '취소',
};

export default function AdminRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: req, refresh } = usePolling<RequestDetail>(
    `/api/admin/requests/${id}`,
    8_000,
  );
  const { data: candData, refresh: refreshCands } = usePolling<{
    candidates: Candidate[];
  }>(req?.status === 'RECEIVED' ? `/api/admin/requests/${id}/candidates` : null, 15_000);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function assign(providerId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/requests/${id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '배정에 실패했습니다');
        return;
      }
      await Promise.all([refresh(), refreshCands()]);
    } catch {
      setError('네트워크 오류가 발생했습니다');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!window.confirm('이 접수를 취소할까요?')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/requests/${id}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '취소에 실패했습니다');
        return;
      }
      await refresh();
    } catch {
      setError('네트워크 오류가 발생했습니다');
    } finally {
      setBusy(false);
    }
  }

  if (!req) {
    return <main className="p-6 text-center text-gray-400">불러오는 중…</main>;
  }

  const cancellable = ['RECEIVED', 'ASSIGNED', 'ACCEPTED', 'DISPATCHED'].includes(
    req.status,
  );

  return (
    <main className="min-h-screen pb-10">
      <header className="flex items-center gap-3 border-b border-gray-200 p-4">
        <Link href="/admin" className="text-xl">
          ←
        </Link>
        <h1 className="text-lg font-bold">접수 #{req.lookupCode}</h1>
        <div className="ml-auto flex gap-1">
          <UrgencyBadge urgency={req.urgency} />
          <StatusBadge status={req.status} />
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-4 p-4">
        {req.needsAttention && (
          <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">
            ⚠️ 관리자 확인이 필요합니다 (자동배정 실패 또는 업체 거절)
          </p>
        )}

        <section className="rounded-2xl border border-gray-200 p-4">
          <h2 className="mb-1 text-sm text-gray-500">고장 내용</h2>
          <p className="whitespace-pre-wrap">{req.description}</p>
          {req.hasVoice && (
            <div className="mt-3 rounded-xl bg-gray-50 p-3">
              <p className="mb-1 text-sm font-medium text-gray-600">🎤 고객 음성 녹음</p>
              <audio
                controls
                preload="none"
                src={`/api/admin/requests/${id}/voice`}
                className="w-full"
              />
              {req.voiceTranscript && req.voiceTranscript !== req.description && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">
                  <span className="font-medium">자동 변환 텍스트:</span>{' '}
                  {req.voiceTranscript}
                </p>
              )}
            </div>
          )}
          <div className="mt-3 space-y-1 text-sm text-gray-600">
            <p>
              👤 {req.customerName} ·{' '}
              <a href={`tel:${req.customerPhone}`} className="text-blue-600 underline">
                {req.customerPhone}
              </a>
            </p>
            <p>📍 {req.address ?? '주소 미확인'}</p>
            {req.lat != null && req.lng != null && (
              <a
                href={`https://map.kakao.com/link/map/고객위치,${req.lat},${req.lng}`}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-blue-600 underline"
              >
                지도에서 보기
              </a>
            )}
            <p className="text-xs text-gray-400">
              접수 {new Date(req.createdAt).toLocaleString('ko-KR')}
            </p>
          </div>
        </section>

        {req.status === 'RECEIVED' && (
          <section className="rounded-2xl border border-blue-200 p-4">
            <h2 className="mb-2 font-semibold text-blue-700">거리순 추천 업체</h2>
            {!candData ? (
              <p className="text-sm text-gray-400">불러오는 중…</p>
            ) : candData.candidates.length === 0 ? (
              <p className="text-sm text-gray-500">배정 가능한 활성 업체가 없습니다</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {candData.candidates.map((c) => (
                  <div
                    key={c.providerId}
                    className="flex items-center justify-between rounded-xl border border-gray-200 p-3"
                  >
                    <div>
                      <p className="font-bold">
                        {c.name}{' '}
                        {c.rejectedThisRequest && (
                          <span className="text-xs font-medium text-red-500">
                            (이 건 거절함)
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        {c.distanceKm != null
                          ? `${c.distanceKm.toFixed(1)}km`
                          : '거리 미확인'}{' '}
                        · {c.address}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => assign(c.providerId)}
                      disabled={busy}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                    >
                      배정
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {req.assignments.length > 0 && (
          <section className="rounded-2xl border border-gray-200 p-4">
            <h2 className="mb-2 text-sm text-gray-500">배정 이력</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {req.assignments.map((a) => (
                <div key={a.id} className="rounded-xl bg-gray-50 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{a.provider.name}</span>
                    <span
                      className={
                        a.status === 'REJECTED'
                          ? 'font-medium text-red-500'
                          : a.status === 'ACCEPTED'
                            ? 'font-medium text-green-600'
                            : 'text-gray-500'
                      }
                    >
                      {ASSIGNMENT_STATUS_LABEL[a.status] ?? a.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {a.assignedBy === 'AUTO' ? '자동배정' : '수동배정'}
                    {a.distanceKm != null && ` · ${a.distanceKm.toFixed(1)}km`} ·{' '}
                    {new Date(a.createdAt).toLocaleString('ko-KR')}
                  </p>
                  {a.rejectReason && (
                    <p className="mt-1 text-xs text-red-500">사유: {a.rejectReason}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {error && (
          <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-600">
            {error}
          </p>
        )}

        {cancellable && (
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            className="w-full rounded-2xl border border-red-300 p-3 font-bold text-red-600 disabled:opacity-60"
          >
            접수 취소
          </button>
        )}
      </div>
    </main>
  );
}
