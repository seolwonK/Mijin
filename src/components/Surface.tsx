// "결"(C) 소프트 서피스 프리미티브 — Card.tsx(border+shadow-card)와 달리 보더 없이 그림자만으로
// 면을 분리한다("카드리스" 원칙, .omc/research/concepts/rationale.md 안 C 참조).
// Card.tsx는 미마이그레이션 화면(다수)이 계속 쓰므로 그대로 두고, 신규 C 화면은 이 프리미티브를 쓴다.
// tint: 1차 액션 표면(히어로 CTA 등)을 옅은 브랜드 그라데이션 + 강한 그림자로 강조할 때 사용.
export function surfaceClasses(extra = '', tint = false) {
  const base = tint
    ? 'bg-gradient-to-b from-brand-50/70 to-white shadow-surface-lg'
    : 'bg-white shadow-surface-sm';
  return `${base} ${extra}`.trim();
}

export default function Surface({
  as: Tag = 'div',
  tint = false,
  className = '',
  ...props
}: {
  as?: 'div' | 'section';
  tint?: boolean;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  const Component = Tag;
  return <Component className={surfaceClasses(className, tint)} {...props} />;
}
