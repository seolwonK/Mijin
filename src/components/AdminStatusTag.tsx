// "관제탑"(B) 상태/긴급도 표시 — 라이트 관리자 화면용 dot+라벨 조합.
// StatusPill.tsx("결", 파스텔 라이트 배경칩)와는 별개 — 관리자 화면 전용 정밀 톤.
// 라이트 단일화: 과거 다크 셸 배경 토큰군은 삭제됨 — dot은 유지 잉크 토큰 + 표준 팔레트로
// 매핑한다(흰 배경 대비 확보, 색 의미 불변).
const STATUS: Record<string, { label: string; dot: string; strike?: boolean }> = {
  RECEIVED: { label: '배정대기', dot: 'bg-neutral-400' },
  ASSIGNED: { label: '배정됨', dot: 'bg-slate-500' },
  // ACCEPTED는 상태 전용 admin-violet-ink(hue 300)로 브랜드 블루와 분리한다.
  ACCEPTED: { label: '수락됨', dot: 'bg-admin-violet-ink' },
  DISPATCHED: { label: '출동중', dot: 'bg-amber-500' },
  COMPLETED: { label: '완료', dot: 'bg-emerald-500' },
  CANCELED: { label: '취소', dot: 'bg-neutral-400', strike: true },
};

export function AdminStatusTag({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, dot: 'bg-neutral-400' };
  const textColor = s.strike ? 'text-muted' : 'text-fg';
  return (
    <span className={`inline-flex items-center gap-2 text-[12.5px] font-medium md:text-[14px] ${textColor} ${s.strike ? 'line-through' : ''}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

const URGENCY: Record<string, { label: string; className: string }> = {
  CRITICAL: { label: '초긴급', className: 'bg-red-50 text-red-700' },
  URGENT: { label: '긴급', className: 'bg-amber-50 text-amber-700' },
  NORMAL: { label: '일반', className: 'text-muted' },
};

export function AdminUrgencyTag({ urgency }: { urgency: string }) {
  const u = URGENCY[urgency] ?? { label: urgency, className: 'text-muted' };
  return (
    <span
      className={`inline-block rounded-admin-sm px-1.5 py-0.5 font-mono text-[10.5px] font-bold md:text-[12px] ${u.className}`}
    >
      {u.label}
    </span>
  );
}
