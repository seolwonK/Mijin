// "관제탑"(B) 상태/긴급도 표시 — dot+라벨 조합. `tone='dark'`(대시보드, admin-bg 위)와
// `tone='light'`(폼·상세 등 "B-라이트" 화면, 기존 라이트 뉴트럴 배경 위) 둘 다 지원한다.
// StatusPill.tsx("결", 파스텔 라이트 배경칩)와는 별개 — 관리자 화면 전용 정밀 톤.
type Tone = 'dark' | 'light';

const STATUS: Record<string, { label: string; dot: string; dotLight?: string; strike?: boolean }> = {
  RECEIVED: { label: '배정대기', dot: 'bg-admin-faint' },
  ASSIGNED: { label: '배정됨', dot: 'bg-admin-slate' },
  ACCEPTED: { label: '수락됨', dot: 'bg-admin-cyan', dotLight: 'bg-admin-cyan-ink' },
  DISPATCHED: { label: '출동중', dot: 'bg-admin-amber' },
  COMPLETED: { label: '완료', dot: 'bg-admin-emerald' },
  CANCELED: { label: '취소', dot: 'bg-admin-faint', strike: true },
};

export function AdminStatusTag({ status, tone = 'dark' }: { status: string; tone?: Tone }) {
  const s = STATUS[status] ?? { label: status, dot: 'bg-admin-faint' };
  const dot = (tone === 'light' && s.dotLight) || s.dot;
  const textColor = s.strike
    ? tone === 'light'
      ? 'text-muted'
      : 'text-admin-faint'
    : tone === 'light'
      ? 'text-fg'
      : 'text-admin-ink';
  return (
    <span className={`inline-flex items-center gap-2 text-[12.5px] font-medium ${textColor} ${s.strike ? 'line-through' : ''}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      {s.label}
    </span>
  );
}

const URGENCY_DARK: Record<string, { label: string; className: string }> = {
  CRITICAL: { label: '초긴급', className: 'bg-admin-red/15 text-admin-red' },
  URGENT: { label: '긴급', className: 'bg-admin-amber/15 text-admin-amber' },
  NORMAL: { label: '일반', className: 'text-admin-faint' },
};
// 라이트 톤은 admin-red/-amber(다크 배경용 고명도 값)를 텍스트로 쓰면 흰 배경 대비 WCAG
// 미달이라, 앱 전역에서 이미 검증된 red-700/amber-700 톤(StatusBadge.tsx와 동일 계열)을 쓴다.
const URGENCY_LIGHT: Record<string, { label: string; className: string }> = {
  CRITICAL: { label: '초긴급', className: 'bg-red-50 text-red-700' },
  URGENT: { label: '긴급', className: 'bg-amber-50 text-amber-700' },
  NORMAL: { label: '일반', className: 'text-muted' },
};

export function AdminUrgencyTag({ urgency, tone = 'dark' }: { urgency: string; tone?: Tone }) {
  const table = tone === 'light' ? URGENCY_LIGHT : URGENCY_DARK;
  const u = table[urgency] ?? { label: urgency, className: tone === 'light' ? 'text-muted' : 'text-admin-faint' };
  return (
    <span
      className={`inline-block rounded-admin-sm px-1.5 py-0.5 font-mono text-[10.5px] font-bold ${u.className}`}
    >
      {u.label}
    </span>
  );
}
