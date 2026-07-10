// "관제탑"(B) 상태/긴급도 표시 — 다크 서피스에서 대비가 맞는 dot+라벨 조합.
// StatusPill.tsx("결", 파스텔 라이트 배경칩)와 별개로 둔다 — 옅은 파스텔 배경칩을 다크 배경 위에
// 그대로 쓰면 흰 얼룩처럼 떠 보인다.
const STATUS: Record<string, { label: string; dot: string; strike?: boolean }> = {
  RECEIVED: { label: '배정대기', dot: 'bg-admin-faint' },
  ASSIGNED: { label: '배정됨', dot: 'bg-admin-slate' },
  ACCEPTED: { label: '수락됨', dot: 'bg-admin-cyan' },
  DISPATCHED: { label: '출동중', dot: 'bg-admin-amber' },
  COMPLETED: { label: '완료', dot: 'bg-admin-emerald' },
  CANCELED: { label: '취소', dot: 'bg-admin-faint', strike: true },
};

export function AdminStatusTag({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, dot: 'bg-admin-faint' };
  return (
    <span
      className={`inline-flex items-center gap-2 text-[12.5px] font-medium ${
        s.strike ? 'text-admin-faint line-through' : 'text-admin-ink'
      }`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

const URGENCY: Record<string, { label: string; className: string }> = {
  CRITICAL: { label: '초긴급', className: 'bg-admin-red/15 text-admin-red' },
  URGENT: { label: '긴급', className: 'bg-admin-amber/15 text-admin-amber' },
  NORMAL: { label: '일반', className: 'text-admin-faint' },
};

export function AdminUrgencyTag({ urgency }: { urgency: string }) {
  const u = URGENCY[urgency] ?? { label: urgency, className: 'text-admin-faint' };
  return (
    <span
      className={`inline-block rounded-admin-sm px-1.5 py-0.5 font-mono text-[10.5px] font-bold ${u.className}`}
    >
      {u.label}
    </span>
  );
}
