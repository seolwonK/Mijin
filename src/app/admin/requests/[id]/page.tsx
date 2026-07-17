'use client';

import { use, useState } from 'react';
import BackButton from '@/components/BackButton';
import { usePolling } from '@/components/usePolling';
import { AdminStatusTag, AdminUrgencyTag } from '@/components/AdminStatusTag';
import { useConfirm } from '@/components/useConfirm';
import { AlertIcon, StarIcon } from '@/components/icons';
import AdminCandidatePanel, { type AdminCandidate } from '@/components/AdminCandidatePanel';

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

type SurveyInfo = {
  submitted: boolean;
  rating: number | null;
  comment: string | null;
  paidAmount: number | null;
  submittedAt: string | null;
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
  // 카운트다운 원천(A-5, additive) — 기존 API 응답에 추가된 읽기 전용 필드.
  assignBaseAt: string;
  autoAssignEnabled: boolean;
  waitMinutes: number | null;
  assignments: AssignmentRow[];
  survey: SurveyInfo | null;
};


const ASSIGNMENT_STATUS_LABEL: Record<string, string> = {
  REQUESTED: '응답 대기',
  ACCEPTED: '수락',
  REJECTED: '거절',
  CANCELED: '취소',
};

// "관제탑"(B) B-라이트 — 거리순 추천/배정/회수/취소 로직은 완전히 동일, 표현만 재도색.
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
  const { data: candData, refresh: refreshCands } = usePolling<{ candidates: AdminCandidate[] }>(
    req?.status === 'RECEIVED' ? `/api/admin/requests/${id}/candidates` : null,
    15_000,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, confirmUI] = useConfirm();


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
    return <main className="p-6 text-center text-muted">불러오는 중…</main>;
  }

  const cancellable = ['RECEIVED', 'ASSIGNED', 'ACCEPTED', 'DISPATCHED'].includes(
    req.status,
  );

  return (
    <main className="min-h-screen pb-10">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-surface/85 px-4 py-2 backdrop-blur">
        <BackButton fallback="/admin" />
        <h1 className="font-mono text-lg font-bold">접수 #{req.lookupCode}</h1>
        <div className="ml-auto flex items-center gap-3">
          <AdminUrgencyTag urgency={req.urgency} />
          <AdminStatusTag status={req.status} />
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-4 p-4">
        {req.needsAttention && (
          <p className="flex items-center gap-1.5 rounded-admin-md bg-red-50 p-3 text-sm font-medium text-red-600">
            <AlertIcon className="h-4 w-4 shrink-0" />
            관리자 확인이 필요합니다 (자동배정 실패 또는 업체 거절)
          </p>
        )}

        <section className="rounded-admin-md border border-border p-4">
          <h2 className="mb-1 text-sm text-muted">고장 내용</h2>
          <p className="whitespace-pre-wrap">{req.description}</p>
          {req.hasVoice && (
            <div className="mt-3 rounded-admin-md bg-neutral-50 p-3">
              <p className="mb-1 text-sm font-medium text-neutral-600">고객 음성 녹음</p>
              <audio
                controls
                preload="none"
                src={`/api/admin/requests/${id}/voice`}
                className="w-full"
              />
              {req.voiceTranscript && req.voiceTranscript !== req.description && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-600">
                  <span className="font-medium">자동 변환 텍스트:</span>{' '}
                  {req.voiceTranscript}
                </p>
              )}
            </div>
          )}
          <div className="mt-3 space-y-1 text-sm text-neutral-600">
            <p>
              {req.customerName} ·{' '}
              <a href={`tel:${req.customerPhone}`} className="font-mono text-admin-cyan-ink underline">
                {req.customerPhone}
              </a>
            </p>
            <p>{req.address ?? '주소 미확인'}</p>
            {req.lat != null && req.lng != null && (
              <a
                href={`https://map.kakao.com/link/map/고객위치,${req.lat},${req.lng}`}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-admin-cyan-ink underline"
              >
                지도에서 보기
              </a>
            )}
            <p className="text-xs text-muted md:text-sm">
              접수 {new Date(req.createdAt).toLocaleString('ko-KR')}
            </p>
          </div>
        </section>

        {req.status === 'ASSIGNED' && (
          <section className="rounded-admin-md border border-admin-cyan-ink/25 bg-admin-cyan-ink/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-admin-cyan-ink">업체 응답 대기 중</p>
                <p className="mt-0.5 text-sm text-muted">
                  응답이 없으면 배정을 회수하고 다른 업체에 다시 배정할 수 있습니다.
                </p>
              </div>
              <button
                type="button"
                onClick={unassign}
                disabled={busy}
                className="h-11 shrink-0 rounded-admin-md border border-red-300 bg-white px-4 text-sm font-bold text-red-600 active:bg-red-50 disabled:opacity-60"
              >
                배정 회수
              </button>
            </div>
          </section>
        )}

        {req.status === 'RECEIVED' && (
          <AdminCandidatePanel
            requestId={id}
            candidates={candData?.candidates ?? null}
            urgency={req.urgency}
            autoAssignEnabled={req.autoAssignEnabled}
            needsAttention={req.needsAttention}
            assignBaseAt={req.assignBaseAt}
            waitMinutes={req.waitMinutes}
            busy={busy}
            setBusy={setBusy}
            confirm={confirm}
            onAssigned={async () => {
              await Promise.all([refresh(), refreshCands()]);
            }}
          />
        )}

        {req.assignments.length > 0 && (
          <section className="rounded-admin-md border border-border p-4">
            <h2 className="mb-2 text-sm text-muted">배정 이력</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {req.assignments.map((a) => (
                <div key={a.id} className="rounded-admin-md bg-neutral-50 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 font-bold">
                      {a.assignee?.name ?? '—'}
                      {a.assignee?.kind === 'TECHNICIAN' && (
                        <span className="ml-1 text-xs font-medium text-emerald-600 md:text-sm">
                          (기술자)
                        </span>
                      )}{' '}
                      {a.assignee && (
                        <a
                          href={`tel:${a.assignee.phone}`}
                          className="font-mono text-xs font-medium whitespace-nowrap text-admin-cyan-ink underline md:text-sm"
                        >
                          {a.assignee.phone}
                        </a>
                      )}
                    </span>
                    <span
                      className={
                        a.status === 'REJECTED'
                          ? 'font-medium text-red-500'
                          : a.status === 'ACCEPTED'
                            ? 'font-medium text-green-600'
                            : 'text-muted'
                      }
                    >
                      {ASSIGNMENT_STATUS_LABEL[a.status] ?? a.status}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted md:text-sm">
                    {a.assignedBy === 'AUTO' ? '자동배정' : '수동배정'}
                    {a.distanceKm != null && ` · ${a.distanceKm.toFixed(1)}km`} ·{' '}
                    {new Date(a.createdAt).toLocaleString('ko-KR')}
                  </p>
                  {a.rejectReason && (
                    <p className="mt-1 text-xs text-red-500 md:text-sm">사유: {a.rejectReason}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-admin-md border border-border p-4">
          <h2 className="mb-2 text-sm text-muted">만족도 조사</h2>
          {req.survey == null ? (
            <p className="text-sm text-muted">미발송</p>
          ) : !req.survey.submitted ? (
            <p className="text-sm text-muted">미참여</p>
          ) : (
            (() => {
              const survey = req.survey;
              return (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1" aria-label={`별점 ${survey.rating}점`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <StarIcon
                        key={n}
                        filled={survey.rating != null && n <= survey.rating}
                        className={`h-5 w-5 ${
                          survey.rating != null && n <= survey.rating
                            ? 'text-amber-400'
                            : 'text-neutral-300'
                        }`}
                      />
                    ))}
                  </div>
                  {survey.comment && (
                    <p className="whitespace-pre-wrap text-sm">{survey.comment}</p>
                  )}
                  <p className="text-sm text-neutral-600">
                    지불 금액{' '}
                    {survey.paidAmount != null
                      ? `${survey.paidAmount.toLocaleString('ko-KR')}원`
                      : '미확인'}
                  </p>
                  {survey.submittedAt && (
                    <p className="text-xs text-muted md:text-sm">
                      {new Date(survey.submittedAt).toLocaleString('ko-KR')} 제출
                    </p>
                  )}
                </div>
              );
            })()
          )}
        </section>

        {error && (
          <p className="rounded-admin-md bg-red-50 p-3 text-sm font-medium text-red-600">
            {error}
          </p>
        )}

        {cancellable && (
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            className="w-full rounded-admin-md border border-red-300 p-3 font-bold text-red-600 disabled:opacity-60"
          >
            접수 취소
          </button>
        )}
      </div>
      {confirmUI}
    </main>
  );
}
