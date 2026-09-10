import type { ReactNode } from 'react';
import type { SYMPTOM_ITEMS } from '@/lib/symptoms';

type SymptomKey = (typeof SYMPTOM_ITEMS)[number]['key'];

// 작은 선택 버튼에서도 읽히도록 공통 아이콘과 같은 24px·1.75px 선을 사용한다.
const SYMBOLS: Record<SymptomKey, ReactNode> = {
  outage: <><path d="m3 10 9-7 9 7M5 9v11h14V9" /><path d="m13 8-4 6h3l-1 4 4-6h-3l1-4Z" /></>,
  burning: <><path d="M13 3c1 5-5 5-3 10 1-2 3-2 4-5 3 3 5 5 5 8a7 7 0 0 1-14 0c0-5 5-7 8-13Z" /><path d="M12 14c-2 2-3 3-3 4a3 3 0 0 0 6 0c0-1-1-3-3-4Z" /></>,
  breaker: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 17h8" /><rect x="9" y="10" width="6" height="4" rx="1" /><path d="M12 10v4" /></>,
  appliance: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M5 10h14M8 6v1M8 13v3" /></>,
  outlet: <><rect x="4" y="3" width="16" height="18" rx="3" /><circle cx="12" cy="12" r="5" /><path d="M10 11v1M14 11v1M11 15h2" /></>,
  light: <><path d="M8 15a7 7 0 1 1 8 0l-1 2H9l-1-2ZM9 20h6M11 23h2M12 17v-5m-2-2 2 2 2-2" /></>,
};

export default function HomeSymptomIcon({ symptom, className }: { symptom: SymptomKey; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {SYMBOLS[symptom]}
    </svg>
  );
}
