// blue-pro 전환: brand-*가 딥블루(hue≈258-264)로 re-value되며 RECEIVED의 sky(hue 242)와
// ASSIGNED의 cyan(hue 223)이 브랜드 인접색이 되어 "상태=브랜드" 오인 위험이 생겼다(게이트
// 산출물 상태색 재배치 테이블 참고). 브랜드·완료 앵커(teal/amber/green) 양쪽을 모두 피하는
// slate/violet 밴드로 이동했다 — 시맨틱 의미(상태 자체)는 변경 없음, 색상 재배정만.
// RECEIVED: slate-100/700 대비 9.44:1, ASSIGNED: violet-100/700 대비 6.13:1(둘 다 WCAG AA 이상).
// ACCEPTED(teal)/DISPATCHED(amber)/COMPLETED(green)는 브랜드·상태 앵커라 불변.
const REQUEST_STATUS: Record<string, { label: string; className: string }> = {
  RECEIVED: { label: '배정 대기', className: 'bg-slate-100 text-slate-700' },
  ASSIGNED: { label: '배정됨', className: 'bg-violet-100 text-violet-700' },
  ACCEPTED: { label: '수락됨', className: 'bg-teal-100 text-teal-700' },
  DISPATCHED: { label: '출동중', className: 'bg-amber-100 text-amber-700' },
  COMPLETED: { label: '완료', className: 'bg-green-100 text-green-700' },
  CANCELED: { label: '취소', className: 'bg-neutral-200 text-neutral-600' },
};

const URGENCY: Record<string, { label: string; className: string }> = {
  CRITICAL: { label: '초긴급', className: 'bg-red-600 text-white' },
  URGENT: { label: '긴급', className: 'bg-orange-500 text-white' },
  NORMAL: { label: '일반', className: 'bg-neutral-500 text-white' },
};

export function StatusBadge({ status }: { status: string }) {
  const s = REQUEST_STATUS[status] ?? { label: status, className: 'bg-neutral-100 text-neutral-600' };
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
}

export function UrgencyBadge({ urgency }: { urgency: string }) {
  const u = URGENCY[urgency] ?? { label: urgency, className: 'bg-neutral-500 text-white' };
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold ${u.className}`}>
      {u.label}
    </span>
  );
}
