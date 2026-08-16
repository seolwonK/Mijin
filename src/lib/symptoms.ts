// 메인 증상 선택 CTA(홈)와 접수 폼 프리필이 공유하는 증상 사전.
// 긴급도는 자동 지정하지 않는다 — 버튼은 접수 화면으로 연결만 하고, 긴급도는 고객이 폼에서 직접 고른다.
// label은 타깃층(중장년)의 생활 언어를 따른다: "차단기"가 아니라 "두꺼비집".
export const SYMPTOM_ITEMS = [
  { key: 'outage', emoji: '⚡', label: '집이 정전됐어요', prefill: '집이 정전됐어요.' },
  {
    key: 'burning',
    emoji: '🔥',
    label: '타는 냄새·스파크가 나요',
    prefill: '콘센트나 전선에서 타는 냄새(스파크)가 나요.',
  },
  {
    key: 'breaker',
    emoji: '⚠️',
    label: '두꺼비집이 자꾸 내려가요',
    prefill: '두꺼비집(차단기)이 자꾸 내려가요.',
  },
  {
    key: 'appliance',
    emoji: '❄️',
    label: '냉장고·에어컨이 안 돼요',
    prefill: '냉장고·에어컨에 전기가 안 들어와요.',
  },
  { key: 'outlet', emoji: '🔌', label: '콘센트가 안 돼요', prefill: '콘센트에 전기가 안 들어와요.' },
  {
    key: 'light',
    emoji: '💡',
    label: '조명이 안 켜져요',
    prefill: '형광등(조명)이 안 켜지거나 깜빡여요.',
  },
] as const;

// 홈 그리드 밖(누전 안내 섹션 CTA)에서만 쓰는 증상 — 접수 폼 프리필 사전에는 포함된다.
export const LEAK_SYMPTOM = {
  key: 'leak',
  prefill: '누전이 의심돼요. 두꺼비집이 자꾸 내려가거나 타는 냄새가 나요.',
} as const;

// 접수 폼에서 ?symptom=키 → 설명란 프리필 문구 조회용.
export const SYMPTOM_PREFILLS: Record<string, string> = Object.fromEntries(
  [...SYMPTOM_ITEMS, LEAK_SYMPTOM].map((s) => [s.key, s.prefill]),
);
