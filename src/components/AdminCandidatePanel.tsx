'use client';

import { useEffect, useState } from 'react';
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
  if (!autoAssignEnabled) return <span className="font-mono text-xs font-medium text-muted md:text-sm">자동배정 꺼짐</span>;
  if (needsAttention) return <span className="font-mono text-xs font-medium text-red-500 md:text-sm">관리자 확인 필요</span>;
  if (waitMinutes == null) return null;

  const remaining = new Date(assignBaseAt).getTime() + waitMinutes * 60_000 - now;
  if (remaining <= 0) return <span className="font-mono text-xs font-medium text-admin-cyan-ink md:text-sm">곧 자동배정 실행</span>;
  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs font-medium text-admin-cyan-ink md:text-sm" title="워커 주기(약 30초) 오차가 있는 근사치입니다">
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
  /** 'grid' = 넓은 상세 화면(2열), 'stack' = 좁은 선택 패널(1열). 좁은 컨테이너에서 2열은 카드가 구겨진다. */
  layout?: 'grid' | 'stack';
};

export default function AdminCandidatePanel({
  requestId, candidates, urgency, autoAssignEnabled, needsAttention, assignBaseAt, waitMinutes, busy, setBusy, confirm, onAssigned,
  layout = 'grid',
}: AdminCandidatePanelProps) {
  const [error, setError] = useState<string | null>(null);
  async function assign(candidate: Pick<AdminCandidate, 'kind' | 'id' | 'name'>) {
    if (!(await confirm({ title: '배정', message: `${candidate.name}(${candidate.kind === 'TECHNICIAN' ? '기술자' : '업체'})에게 이 접수를 배정할까요?\n배정 안내 문자가 발송됩니다.`, confirmText: '배정' }))) return;
    const { kind: assigneeKind, id: assigneeId } = candidate;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/requests/${requestId}/assign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assigneeKind, assigneeId }) });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '배정에 실패했습니다');
        return;
      }
      await onAssigned();
    } catch {
      setError('네트워크 오류가 발생했습니다');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-admin-md border border-admin-cyan-ink/25 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-admin-cyan-ink">거리순 추천 (업체·기술자)</h2>
        <AutoAssignCountdown {...{ autoAssignEnabled, needsAttention, assignBaseAt, waitMinutes }} />
      </div>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {!candidates ? <p className="text-sm text-muted">불러오는 중…</p> : candidates.length === 0 ? <p className="text-sm text-muted">배정 가능한 활성 업체·기술자가 없습니다</p> : (() => {
        const autoAssignIndex = findAutoAssignCandidateIndex(candidates);
        return <>
          <p className="mb-2 text-xs text-muted md:text-sm">근거 순서: 거절이력 → 지역 → 30일 배정(전체) → 평균 별점 → 거리{urgency === 'CRITICAL' && ' (초긴급은 30일 배정·별점 단계 미적용)'}</p>
          {autoAssignIndex === -1 && <p className="mb-2 text-xs text-muted md:text-sm">자동배정이 선택할 후보가 없습니다 — 대기시간 경과 시 관리자 확인으로 전환됩니다</p>}
          <div className={layout === 'stack' ? 'grid gap-2' : 'grid gap-2 sm:grid-cols-2'}>
            {candidates.map((candidate, index) => {
              const badge = index === 0 ? null : deriveRankingBadge(candidates[index - 1], candidate, urgency);
              const isAutoAssignPick = index === autoAssignIndex;
              return <div key={`${candidate.kind}:${candidate.id}`} className={`flex items-center justify-between rounded-admin-md border p-3 ${isAutoAssignPick ? 'border-admin-cyan-ink/40 bg-admin-cyan-ink/5' : 'border-border'}`}>
                <div>
                  <p className="font-bold">{candidate.name} <span className={`ml-1 rounded-admin-sm px-1.5 py-0.5 text-xs font-medium md:text-sm ${candidate.kind === 'TECHNICIAN' ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-600'}`}>{candidate.kind === 'TECHNICIAN' ? '기술자' : '업체'}</span>{' '}{candidate.rejectedThisRequest && <span className="text-xs font-medium text-red-500 md:text-sm">(이 건 거절함)</span>}</p>
                  <p className="font-mono text-xs text-muted md:text-sm">{candidate.distanceKm != null ? `${candidate.distanceKm.toFixed(1)}km` : '거리 미확인'} · {candidate.address}</p>
                  <p className="mt-0.5 font-mono text-xs text-muted md:text-sm">30일 배정(수락+거절) {candidate.assigned30d}회 · 평균 별점 {candidate.avgRating.toFixed(1)}{candidate.reviewCount > 0 ? ` (${candidate.reviewCount}건)` : ' (리뷰 없음)'}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5">{isAutoAssignPick && <span className="rounded-admin-sm bg-admin-cyan-ink px-1.5 py-0.5 text-[10.5px] font-bold text-white md:text-sm">자동배정 예정</span>}{index === 0 ? <span className="rounded-admin-sm bg-neutral-100 px-1.5 py-0.5 text-[10.5px] font-medium text-neutral-500 md:text-sm">1순위</span> : badge && <span className="rounded-admin-sm bg-neutral-100 px-1.5 py-0.5 text-[10.5px] font-medium text-neutral-500 md:text-sm">{badge}</span>}</p>
                </div>
                <button type="button" onClick={() => assign(candidate)} disabled={busy} className="rounded-admin-sm bg-admin-cyan-ink px-4 py-2 text-sm font-bold text-white disabled:opacity-60">배정</button>
              </div>;
            })}
          </div>
        </>;
      })()}
    </section>
  );
}
