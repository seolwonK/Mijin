"use client";

import Link from 'next/link';
import { useState } from 'react';
import { usePolling } from '@/components/usePolling';
import { useConfirm } from '@/components/useConfirm';
import { AdminStatusTag, AdminUrgencyTag } from '@/components/AdminStatusTag';
import AdminCandidatePanel, { type AdminCandidate } from '@/components/AdminCandidatePanel';
import styles from '@/components/admin-queue.module.css';
import AdminDrawer from '@/components/AdminDrawer';

type Assignment = { id: string; status: string; assignedBy: string; createdAt: string; assignee: { kind: 'PROVIDER' | 'TECHNICIAN'; name: string } | null };
type RequestDetail = {
  id: string; lookupCode: string; customerName: string; customerPhone: string;
  address: string | null; description: string; status: string; urgency: string;
  needsAttention: boolean; assignBaseAt: string; autoAssignEnabled: boolean;
  waitMinutes: number | null; assignments: Assignment[]; createdAt: string;
  survey: { submitted: boolean; rating: number | null; paidAmount: number | null } | null;
};
const assignmentLabel: Record<string, string> = { REQUESTED: '응답 대기', ACCEPTED: '수락', REJECTED: '거절', CANCELED: '취소', EXPIRED: '무응답 회수' };
const dateTime = (value: string) => new Date(value).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });

export default function SelectedRequestPanel({ requestId, onAssigned, onClose }: { requestId: string; onAssigned: () => void | Promise<void>; onClose?: () => void }) {
  const { data: request, error: requestError, refresh: refreshRequest } = usePolling<RequestDetail>(`/api/admin/requests/${requestId}`, 8_000);
  const { data: candidateData, error: candidateError, refresh: refreshCandidates } = usePolling<{ candidates: AdminCandidate[] }>(request?.status === 'RECEIVED' && !requestError ? `/api/admin/requests/${requestId}/candidates` : null, 15_000);
  const [busy, setBusy] = useState(false);
  const [confirm, confirmUI] = useConfirm('admin');
  async function refreshAfterAssignment() { await Promise.all([refreshRequest(), refreshCandidates()]); await onAssigned(); }
  const currentAssignment = request?.assignments.find(item => ['REQUESTED', 'ACCEPTED'].includes(item.status));

  return <AdminDrawer label="접수 상세 패널" className={styles.inspectorSurface} inlineAt={1440} onClose={() => onClose?.()} closeDisabled={busy}><aside className={styles.panel} aria-label="선택한 접수" aria-busy={!request && !requestError}>
    {confirmUI}
    <div className={styles.panelHeader}>
      <div className={styles.panelHeaderTop}><h2>접수 상세</h2>{onClose && <button type="button" className={styles.close} onClick={onClose} disabled={busy} aria-label="선택한 접수 닫기">✕</button>}</div>
      {request && <><div className={styles.panelIdentity}><strong className={styles.code}>#{request.lookupCode}</strong><AdminStatusTag status={request.status} /><AdminUrgencyTag urgency={request.urgency} /></div><p className={`${styles.note} mt-2`}>{dateTime(request.createdAt)} 접수</p></>}
    </div>
    <div className={styles.panelBody}>
      {requestError && <div role="alert" className={styles.error}><p>{request ? '최신 접수 정보를 확인하지 못했습니다. 다시 조회한 뒤 배정해 주세요.' : '접수 정보를 불러오지 못했습니다.'}</p><p>{requestError}</p><button type="button" className={styles.button} onClick={refreshRequest}>다시 시도</button></div>}
      {!request && !requestError && <p className="py-8 text-sm text-slate-600">접수 정보를 불러오는 중…</p>}
      {request && <>
        <section className={styles.panelSection}><h3>고객 · 현장</h3><div className={styles.panelCustomer}><strong>{request.customerName}</strong><a href={`tel:${request.customerPhone}`}>{request.customerPhone}</a></div><p className={styles.address}>{request.address || '주소가 등록되지 않았습니다.'}</p></section>
        <section className={styles.panelSection}><h3>접수 내용</h3><p className={styles.panelDescription}>{request.description}</p>{request.needsAttention && <p className={styles.warning}>자동 배정이 진행되지 않아 관리자 확인이 필요합니다.</p>}</section>
        {request.status === 'RECEIVED' ? <AdminCandidatePanel requestId={requestId} candidates={requestError || candidateError ? null : candidateData?.candidates ?? null} loadError={requestError || candidateError} onRetry={requestError ? refreshRequest : refreshCandidates} urgency={request.urgency} autoAssignEnabled={request.autoAssignEnabled} needsAttention={request.needsAttention} assignBaseAt={request.assignBaseAt} waitMinutes={request.waitMinutes} busy={busy || !!requestError || !!candidateError} setBusy={setBusy} confirm={confirm} onAssigned={refreshAfterAssignment} layout="stack" /> : <section className={styles.panelSection}><h3>배정 현황</h3>{currentAssignment ? <><p className="font-semibold">{currentAssignment.assignee?.name ?? '담당자 정보 없음'}</p><p className={styles.note}>{currentAssignment.assignee?.kind === 'TECHNICIAN' ? '전기기사' : '업체'} · {assignmentLabel[currentAssignment.status]} · {currentAssignment.assignedBy === 'AUTO' ? '자동 배정' : '관리자 배정'}</p></> : <p className={styles.note}>진행 중인 배정이 없습니다.</p>}</section>}
        {request.status === 'COMPLETED' && <section className={styles.panelSection}><h3>고객 설문</h3><div className={styles.surveySummary}><span>{request.survey?.submitted ? '응답 완료' : request.survey ? '미응답' : '설문 미생성'}</span><strong>{request.survey?.submitted && request.survey.rating != null ? `${request.survey.rating} / 5점` : '—'}</strong></div>{request.survey?.submitted && <p className={`${styles.note} mt-2`}>고객 입력 금액 {request.survey.paidAmount != null ? `${request.survey.paidAmount.toLocaleString('ko-KR')}원` : '미입력'}</p>}</section>}
        <section className={styles.panelSection}><details className={styles.history}><summary>배정 이력 {request.assignments.length}건</summary>{request.assignments.length ? <ol>{request.assignments.map(item => <li key={item.id}><p className="font-semibold">{item.assignee?.name ?? '담당자 정보 없음'}</p><p className={styles.note}>{assignmentLabel[item.status] ?? item.status} · {item.assignedBy === 'AUTO' ? '자동 배정' : '관리자 배정'}<br />{dateTime(item.createdAt)}</p></li>)}</ol> : <p className={styles.note}>아직 배정 이력이 없습니다.</p>}</details></section>
      </>}
    </div>
    <div className={styles.panelFooter}><Link href={`/admin/requests/${requestId}`} className={styles.button}>상세 열기 <span aria-hidden="true">↗</span></Link></div>
  </aside></AdminDrawer>;
}
