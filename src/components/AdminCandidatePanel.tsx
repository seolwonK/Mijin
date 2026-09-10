'use client';

import { useEffect, useRef, useState } from 'react';
import styles from '@/components/admin-queue.module.css';
import { ClockIcon } from '@/components/icons';
import { deriveRankingBadge, findAutoAssignCandidateIndex } from '@/lib/candidateRankingDisplay';

export type AdminCandidate = {
  kind: 'PROVIDER' | 'TECHNICIAN';
  id: string;
  name: string;
  phone: string;
  address: string;
  distanceKm: number | null;
  coversRegion: boolean;
  rejectedThisRequest: boolean;
  assigned30d: number;
  avgRating: number;
  reviewCount: number;
  eggBalance: number; // 알 크레딧 — 유료 상위노출 (candidates API가 그대로 반환)
  sameDistrict: boolean; // CRITICAL 같은구 동급 판정 (배지 파생용)
};

type Confirm = (options: {
  title: string;
  message: string;
  confirmText: string;
  danger?: boolean;
}) => Promise<boolean>;

function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`;
}

function AutoAssignCountdown({
  autoAssignEnabled,
  needsAttention,
  assignBaseAt,
  waitMinutes,
}: Pick<AdminCandidatePanelProps, 'autoAssignEnabled' | 'needsAttention' | 'assignBaseAt' | 'waitMinutes'>) {
  const active = autoAssignEnabled && !needsAttention && waitMinutes != null;
  const now = useNow(active);
  if (!autoAssignEnabled) return <span className="text-xs font-medium text-muted md:text-sm">자동배정 꺼짐</span>;
  if (needsAttention) return <span className="text-xs font-medium text-red-800 md:text-sm">관리자 확인 필요</span>;
  if (waitMinutes == null) return null;

  const remaining = new Date(assignBaseAt).getTime() + waitMinutes * 60_000 - now;
  if (remaining <= 0) return <span className="text-xs font-medium text-admin-cyan-ink md:text-sm">곧 자동배정 실행</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-admin-cyan-ink md:text-sm" title="워커 주기(약 30초) 오차가 있는 근사치입니다">
      <ClockIcon className="h-3.5 w-3.5" />자동배정까지 {formatRemaining(remaining)}
    </span>
  );
}

export type AdminCandidatePanelProps = {
  requestId: string;
  candidates: AdminCandidate[] | null;
  urgency: string;
  autoAssignEnabled: boolean;
  needsAttention: boolean;
  assignBaseAt: string;
  waitMinutes: number | null;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  confirm: Confirm;
  onAssigned: () => void | Promise<void>;
  /** 넓은 상세 화면은 후보 6명, 선택 패널은 3명부터 표시한다. */
  layout?: 'grid' | 'stack';
  loadError?: string | null;
  onRetry?: () => void | Promise<unknown>;
};

export default function AdminCandidatePanel({
  requestId, candidates, urgency, autoAssignEnabled, needsAttention, assignBaseAt, waitMinutes, busy, setBusy, confirm, onAssigned,
  layout = 'grid', loadError, onRetry,
}: AdminCandidatePanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const assignmentLock = useRef(false);
  async function assign(candidate: Pick<AdminCandidate, 'kind' | 'id' | 'name'>) {
    if (busy || loadError || assignmentLock.current) return;
    assignmentLock.current = true;
    try {
      if (!(await confirm({ title: '배정 확인', message: `${candidate.name}(${candidate.kind === 'TECHNICIAN' ? '전기기사' : '업체'})에게 이 접수를 배정할까요?\n배정 안내 문자가 발송됩니다.`, confirmText: '배정' }))) return;
      const { kind: assigneeKind, id: assigneeId } = candidate;
      setBusy(true);
      setError(null);
      const res = await fetch(`/api/admin/requests/${requestId}/assign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assigneeKind, assigneeId }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? '배정에 실패했습니다'); return; }
      await onAssigned();
    } catch { setError('네트워크 오류가 발생했습니다. 다시 시도해 주세요.'); }
    finally { assignmentLock.current = false; setBusy(false); }
  }
  const autoAssignIndex = findAutoAssignCandidateIndex(candidates ?? []);
  const visible = candidates ? expanded ? candidates : candidates.slice(0, layout === 'stack' ? 3 : 6) : [];
  const limit = layout === 'stack' ? 3 : 6;
  return <section className={styles.candidateSection} data-layout={layout} aria-label="배정 후보">
    <div className={styles.candidateHeader}><h2>배정 후보{candidates ? ` ${candidates.length}` : ''}</h2><AutoAssignCountdown {...{ autoAssignEnabled, needsAttention, assignBaseAt, waitMinutes }} /></div>
    <details className={styles.details}><summary>추천 순위 기준</summary><p className={styles.note}>{urgency === 'CRITICAL' ? '초긴급 접수는 이전 응답 이력과 담당 지역을 확인한 뒤, 같은 시·군·구, 알 보유량, 거리 순으로 추천합니다.' : '이전 응답 이력과 담당 지역을 확인한 뒤, 알 보유량, 최근 30일 배정 수, 평균 별점, 거리 순으로 추천합니다.'}</p></details>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {loadError ? <div role="alert" className={styles.error}><p>배정 후보를 불러오지 못했습니다.</p><p>{loadError}</p>{onRetry && <button type="button" onClick={onRetry} className={styles.button}>후보 다시 조회</button>}</div> : !candidates ? <p className={styles.note}>배정 후보를 불러오는 중…</p> : candidates.length === 0 ? <p className="py-4 text-sm text-slate-600">배정 가능한 활성 업체·전기기사가 없습니다.</p> : <>
      {autoAssignEnabled && autoAssignIndex === -1 && <p className={styles.warning}>자동 배정 대상이 없습니다. 대기시간이 지나면 관리자 확인으로 전환됩니다.</p>}
      <ol className={styles.candidateList}>{visible.map((candidate, index) => {
        const reason = index === 0 ? null : deriveRankingBadge(candidates[index - 1], candidate, urgency);
        const isPick = index === autoAssignIndex;
        return <li key={`${candidate.kind}:${candidate.id}`} className={styles.candidate}>
          <div className={styles.candidateTop}><div className={styles.candidateName}><strong>{index + 1}. {candidate.name}</strong><span>{candidate.kind === 'TECHNICIAN' ? '전기기사' : '업체'}{isPick && autoAssignEnabled && !needsAttention ? ' · 자동배정 예정' : ''}</span></div><button type="button" onClick={() => assign(candidate)} disabled={busy || !!loadError} className={isPick ? styles.primary : styles.button}>배정</button></div>
          {candidate.rejectedThisRequest && <p className={`${styles.note} mt-2`}>이 접수의 거절·회수 이력이 있습니다.</p>}
          <div className={styles.candidateFacts}><strong>{candidate.eggBalance ?? 0}알</strong><span>{candidate.distanceKm != null ? `${candidate.distanceKm.toFixed(1)}km` : '거리 미확인'}</span><span>{candidate.reviewCount > 0 ? `평점 ${candidate.avgRating.toFixed(1)} · 후기 ${candidate.reviewCount}건` : '후기 없음'}</span></div>
          <details className={styles.details}><summary>후보 상세 정보</summary><p className={styles.note}>{candidate.address || '주소 없음'}</p><a className={styles.phone} href={`tel:${candidate.phone}`}>{candidate.phone}</a><p className={`${styles.note} mt-2`}>최근 30일 배정 {candidate.assigned30d}회 · {candidate.coversRegion ? '담당 지역' : '담당 지역 외'}{reason ? ` · 앞 순위와의 차이: ${reason}` : ''}</p></details>
        </li>;
      })}</ol>
      {candidates.length > limit && <button type="button" className={styles.candidateMore} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? '후보 접기' : `나머지 후보 ${candidates.length - limit}명 보기`}</button>}
    </>}
  </section>;
}
