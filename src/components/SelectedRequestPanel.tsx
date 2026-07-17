'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePolling } from '@/components/usePolling';
import { useConfirm } from '@/components/useConfirm';
import { AdminStatusTag } from '@/components/AdminStatusTag';
import AdminCandidatePanel, { type AdminCandidate } from '@/components/AdminCandidatePanel';

type Assignment = { id: string; status: string; assignedBy: string; createdAt: string; assignee: { kind: 'PROVIDER' | 'TECHNICIAN'; name: string } | null };
type RequestDetail = {
  id: string;
  lookupCode: string;
  status: string;
  urgency: string;
  needsAttention: boolean;
  assignBaseAt: string;
  autoAssignEnabled: boolean;
  waitMinutes: number | null;
  assignments: Assignment[];
  survey: { submitted: boolean; rating: number | null } | null;
};

const ASSIGNMENT_STATUS_LABEL: Record<string, string> = { REQUESTED: '응답 대기', ACCEPTED: '수락', REJECTED: '거절', CANCELED: '취소' };

export default function SelectedRequestPanel({ requestId, onAssigned }: { requestId: string; onAssigned: () => void | Promise<void> }) {
  const { data: request, refresh: refreshRequest } = usePolling<RequestDetail>(`/api/admin/requests/${requestId}`, 8_000);
  const { data: candidateData, refresh: refreshCandidates } = usePolling<{ candidates: AdminCandidate[] }>(request?.status === 'RECEIVED' ? `/api/admin/requests/${requestId}/candidates` : null, 15_000);
  const [busy, setBusy] = useState(false);
  const [confirm, confirmUI] = useConfirm();
  const refreshAfterAssignment = async () => {
    await Promise.all([refreshRequest(), refreshCandidates()]);
    await onAssigned();
  };

  if (!request) {
    return <aside className="rounded-admin-md border border-border bg-white p-4" aria-busy="true"><div className="h-5 w-28 animate-pulse rounded bg-neutral-100" /><div className="mt-3 h-20 animate-pulse rounded bg-neutral-100" /></aside>;
  }

  return <aside className="space-y-3 rounded-admin-md border border-border bg-white p-4">
    {confirmUI}
    <div className="flex items-center justify-between gap-2">
      <div><p className="font-mono text-xs text-muted md:text-sm">SELECTED REQUEST</p><h2 className="font-mono text-lg font-bold">#{request.lookupCode}</h2></div>
      <AdminStatusTag status={request.status} />
    </div>
    {request.status === 'RECEIVED' ? <AdminCandidatePanel requestId={requestId} candidates={candidateData?.candidates ?? null} urgency={request.urgency} autoAssignEnabled={request.autoAssignEnabled} needsAttention={request.needsAttention} assignBaseAt={request.assignBaseAt} waitMinutes={request.waitMinutes} busy={busy} setBusy={setBusy} confirm={confirm} onAssigned={refreshAfterAssignment} layout="stack" /> : <section className="space-y-2 rounded-admin-md bg-neutral-50 p-3 text-sm md:text-base">
      <p><span className="text-muted">상태</span> <span className="font-semibold">{request.status}</span></p>
      <p><span className="text-muted">배정 이력</span> {request.assignments.length === 0 ? '없음' : `${request.assignments.length}건`}</p>
      {request.assignments.slice(0, 2).map((assignment) => <p key={assignment.id} className="text-xs text-muted md:text-sm">{assignment.assignee?.name ?? '—'} · {ASSIGNMENT_STATUS_LABEL[assignment.status] ?? assignment.status} · {assignment.assignedBy === 'AUTO' ? '자동배정' : '수동배정'}</p>)}
      <p><span className="text-muted">설문</span> {request.survey == null ? '미발송' : request.survey.submitted ? (request.survey.rating != null ? `★${request.survey.rating}` : '참여') : '미참여'}</p>
    </section>}
    <Link href={`/admin/requests/${requestId}`} className="inline-flex text-sm font-semibold text-admin-cyan-ink underline">상세 열기</Link>
  </aside>;
}
