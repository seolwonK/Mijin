// "관제탑"(B) 상태/긴급도 표시 — 라이트 관리자 화면용 틴트 칩.
// StatusPill.tsx("결", 파스텔 라이트 배경칩)와는 별개 — 관리자 화면 전용 정밀 톤.
// 파일럿 리스타일: dot+라벨 → 저채도 틴트 배경 칩(Attio 메셀러리). 색 의미는 dot 시절과
// 동일 유지(ACCEPTED=violet, DISPATCHED=amber, COMPLETED=emerald), 틴트는 배경 전용이고
// 텍스트는 흰 배경 대비가 검증된 잉크/–700 계열만 올린다(globals.css 틴트 토큰 주석 참조).
const STATUS: Record<string, { label: string; chip: string; strike?: boolean }> = {
  RECEIVED: { label: '배정대기', chip: 'bg-neutral-100 text-neutral-600' },
  ASSIGNED: { label: '배정됨', chip: 'bg-slate-50 text-slate-600' },
  // ACCEPTED는 상태 전용 admin-violet(hue 300) 틴트로 브랜드 블루와 분리한다.
  ACCEPTED: { label: '수락됨', chip: 'bg-admin-violet-tint text-admin-violet-ink' },
  DISPATCHED: { label: '출동중', chip: 'bg-amber-50 text-amber-700' },
  COMPLETED: { label: '완료', chip: 'bg-emerald-50 text-emerald-700' },
  CANCELED: { label: '취소', chip: 'bg-neutral-100 text-neutral-600', strike: true },
};

export function AdminStatusTag({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, chip: 'bg-neutral-100 text-neutral-600' };
  return (
    <span
      className={`inline-block rounded-admin-sm px-2 py-0.5 text-xs font-bold ${s.chip} ${s.strike ? 'line-through' : ''}`}
    >
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
      className={`inline-block rounded-admin-sm px-1.5 py-0.5 font-mono text-xs font-bold ${u.className}`}
    >
      {u.label}
    </span>
  );
}
