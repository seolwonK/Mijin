// "결"(C) 파스텔 상태/긴급도 칩 — 기존 StatusBadge.tsx(사각 solid 배지)와 다른 dot+pill 표현.
// 상태 파이프라인·긴급도는 색으로 구분 가능하면 되고 기존 배지의 sky/cyan/teal/amber/green
// 매핑을 그대로 계승할 의무는 없다(팀 합의, .omc/research/concepts/rationale.md).
// StatusBadge.tsx는 미마이그레이션 화면이 계속 쓰므로 그대로 둔다 — 이 컴포넌트는 신규 C 화면 전용.
// blue-pro 전환(redesign/blue-pro): ACCEPTED는 원래 brand-600/50/700 별칭이었으나, brand-*가
// 딥블루로 re-value되며 "상태=브랜드"로 오인될 위험이 생겨 전용 violet(hue≈293, 브랜드
// 258-264·완료 teal/emerald 140-185·긴급 amber 어느 쪽과도 안 겹치는 밴드)으로 분리했다.
// text-violet-700 on bg-violet-50 대비 6.64:1(WCAG AA 4.5:1 이상) — 게이트 산출물 상태색
// 재배치 테이블 참고.
const STATUS: Record<
  string,
  { label: string; dot: string; bg: string; text: string; strike?: boolean }
> = {
  RECEIVED: { label: '배정대기', dot: 'bg-neutral-400', bg: 'bg-neutral-100', text: 'text-neutral-600' },
  // ASSIGNED: blue-pro 전환으로 sky(hue 242)가 브랜드 인접색이 되어 slate(hue 257, 저채도
  // 0.04)로 이동 — text-slate-700 on bg-slate-100 대비 9.44:1(WCAG AA 이상), 게이트 산출물 참고.
  ASSIGNED: { label: '배정됨', dot: 'bg-slate-600', bg: 'bg-slate-100', text: 'text-slate-700' },
  ACCEPTED: { label: '수락됨', dot: 'bg-violet-600', bg: 'bg-violet-50', text: 'text-violet-700' },
  DISPATCHED: { label: '출동중', dot: 'bg-teal-600', bg: 'bg-teal-50', text: 'text-teal-700' },
  COMPLETED: { label: '완료', dot: 'bg-emerald-600', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  CANCELED: {
    label: '취소',
    dot: 'bg-neutral-400',
    bg: 'bg-neutral-100',
    text: 'text-neutral-500',
    strike: true,
  },
};

export function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? {
    label: status,
    dot: 'bg-neutral-400',
    bg: 'bg-neutral-100',
    text: 'text-neutral-600',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${s.bg} ${s.text} ${s.strike ? 'line-through' : ''}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

const URGENCY: Record<string, { label: string; dot: string; text: string }> = {
  CRITICAL: { label: '초긴급', dot: 'bg-red-600', text: 'text-red-700' },
  URGENT: { label: '긴급', dot: 'bg-amber-600', text: 'text-amber-700' },
  NORMAL: { label: '일반', dot: 'bg-neutral-400', text: 'text-muted' },
};

export function UrgencyPill({ urgency }: { urgency: string }) {
  const u = URGENCY[urgency] ?? { label: urgency, dot: 'bg-neutral-400', text: 'text-muted' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${u.text}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${u.dot}`} />
      {u.label}
    </span>
  );
}
