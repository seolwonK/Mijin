const REQUEST_STATUS: Record<string, { label: string; className: string }> = {
  RECEIVED: { label: '배정 대기', className: 'bg-sky-100 text-sky-700' },
  ASSIGNED: { label: '배정됨', className: 'bg-blue-100 text-blue-700' },
  ACCEPTED: { label: '수락됨', className: 'bg-indigo-100 text-indigo-700' },
  DISPATCHED: { label: '출동중', className: 'bg-amber-100 text-amber-700' },
  COMPLETED: { label: '완료', className: 'bg-green-100 text-green-700' },
  CANCELED: { label: '취소', className: 'bg-gray-200 text-gray-600' },
};

const URGENCY: Record<string, { label: string; className: string }> = {
  CRITICAL: { label: '초긴급', className: 'bg-red-600 text-white' },
  URGENT: { label: '긴급', className: 'bg-orange-500 text-white' },
  NORMAL: { label: '일반', className: 'bg-gray-500 text-white' },
};

export function StatusBadge({ status }: { status: string }) {
  const s = REQUEST_STATUS[status] ?? { label: status, className: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  );
}

export function UrgencyBadge({ urgency }: { urgency: string }) {
  const u = URGENCY[urgency] ?? { label: urgency, className: 'bg-gray-500 text-white' };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${u.className}`}>
      {u.label}
    </span>
  );
}
