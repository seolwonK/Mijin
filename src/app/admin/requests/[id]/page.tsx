'use client';

import { use, useState } from 'react';
import BackButton from '@/components/BackButton';
import { usePolling } from '@/components/usePolling';
import { StatusBadge, UrgencyBadge } from '@/components/StatusBadge';
import { useConfirm } from '@/components/useConfirm';

type Assignee = { kind: 'PROVIDER' | 'TECHNICIAN'; name: string; phone: string };

type AssignmentRow = {
  id: string;
  status: string;
  assignedBy: string;
  distanceKm: number | null;
  rejectReason: string | null;
  respondedAt: string | null;
  createdAt: string;
  assignee: Assignee | null;
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
  kind: 'PROVIDER' | 'TECHNICIAN';
  id: string;
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
  const [confirm, confirmUI] = useConfirm();

  async function assign(assigneeKind: 'PROVIDER' | 'TECHNICIAN', assigneeId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/requests/${id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeKind, assigneeId }),
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

  async function unassign() {
    if (
      !(await confirm({
        title: '배정 회수',
        message:
          '현재 배정을 회수하고 배정 대기로 되돌릴까요?\n업체에는 회수 안내 문자가 발송됩니다.',
        confirmText: '회수',
        danger: true,
      }))
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/requests/${id}/unassign`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '배정 회수에 실패했습니다');
        return;
      }
      await refresh();
    } catch {
      setError('네트워크 오류가 발생했습니다');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (
      !(await confirm({
        title: '접수 취소',
        message: '이 접수를 취소할까요?',
        confirmText: '접수 취소',
        danger: true,
      }))
    )
      return;
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
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-gray-200 bg-white/95 px-4 py-2 backdrop-blur">
        <BackButton fallback="/admin" />
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

        {req.status === 'ASSIGNED' && (
          <section className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-blue-700">업체 응답 대기 중</p>
                <p className="mt-0.5 text-sm text-gray-500">
                  응답이 없으면 배정을 회수하고 다른 업체에 다시 배정할 수 있습니다.
                </p>
              </div>
              <button
                type="button"
                onClick={unassign}
                disabled={busy}
                className="h-11 shrink-0 rounded-xl border border-red-300 bg-white px-4 text-sm font-bold text-red-600 active:bg-red-50 disabled:opacity-60"
              >
                배정 회수
              </button>
            </div>
          </section>
        )}

        {req.status === 'RECEIVED' && (
          <section className="rounded-2xl border border-blue-200 p-4">
            <h2 className="mb-2 font-semibold text-blue-700">거리순 추천 (업체·기술자)</h2>
            {!candData ? (
              <p className="text-sm text-gray-400">불러오는 중…</p>
            ) : candData.candidates.length === 0 ? (
              <p className="text-sm text-gray-500">
                배정 가능한 활성 업체·기술자가 없습니다
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {candData.candidates.map((c) => (
                  <div
                    key={`${c.kind}:${c.id}`}
                    className="flex items-center justify-between rounded-xl border border-gray-200 p-3"
                  >
                    <div>
                      <p className="font-bold">
                        {c.name}{' '}
                        <span
                          className={`ml-1 rounded px-1.5 py-0.5 text-xs font-medium ${
                            c.kind === 'TECHNICIAN'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {c.kind === 'TECHNICIAN' ? '기술자' : '업체'}
                        </span>{' '}
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
                      onClick={() => assign(c.kind, c.id)}
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
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 font-bold">
                      {a.assignee?.name ?? '—'}
                      {a.assignee?.kind === 'TECHNICIAN' && (
                        <span className="ml-1 text-xs font-medium text-emerald-600">
                          (기술자)
                        </span>
                      )}{' '}
                      {a.assignee && (
                        <a
                          href={`tel:${a.assignee.phone}`}
                          className="whitespace-nowrap text-xs font-medium text-blue-600 underline"
                        >
                          📞 {a.assignee.phone}
                        </a>
                      )}
                    </span>
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
      {confirmUI}
    </main>
  );
}
