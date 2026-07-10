// ASSIGNED/ACCEPTED는 원래 Tailwind 파란 계열/인디고였다 — 둘 다 브랜드(현재는 브론즈-골드,
// "결" 하이브리드 파운데이션 기준 — 과거 Electric Violet 시절 작성된 주석을 갱신)
// alias 경유 시 브랜드색과 겹치거나(전자는 alias로 브랜드와 완전히 동일) hue상 인접해
// "상태=브랜드" 오인 위험이 있다(design-direction.md §4 watch-item). cyan/teal로 재배정해
// 브랜드와 분리하되 파이프라인 순서(대기→배정→수락→출동→완료)를 sky→cyan→teal→amber→green
// 그라데이션으로 유지했다 — 시맨틱 의미(상태 자체)는 변경 없음, 색상 재배정만.
const REQUEST_STATUS: Record<string, { label: string; className: string }> = {
  RECEIVED: { label: '배정 대기', className: 'bg-sky-100 text-sky-700' },
  ASSIGNED: { label: '배정됨', className: 'bg-cyan-100 text-cyan-700' },
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
