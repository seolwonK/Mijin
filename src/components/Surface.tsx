// "결"(C) 소프트 서피스 프리미티브 — 보더 없이 그림자만으로 면을 분리한다("카드리스" 원칙,
// .omc/research/concepts/rationale.md 안 C 참조). 과거 병행하던 border+shadow-card 방식의
// Card.tsx는 전량 이 프리미티브로 마이그레이션 완료돼 삭제됐다(G0 §1a-3) — 앱 내 카드형 표면은
// 이제 전부 이 문법 하나로 통일.
//
// 면 분리 문법: 그림자 강도 3단(globals.css --shadow-surface-sm/md/lg)에서 이 프리미티브는
// 기본 sm과 tint 전용 lg 두 단만 노출한다(중간 md는 이 파일 밖 개별 케이스에서 임의 클래스로
// 필요 시 직접 사용 — 아직 표준 소비처가 없어 별도 prop으로 승격하지 않았다).
// tint: 1차 액션 표면(히어로 CTA 등)을 옅은 브랜드 그라데이션 + 강한 그림자(lg)로 묶어 강조할 때
// 사용 — 그라데이션과 그림자 단계가 항상 함께 움직이는 것이 의도(둘을 독립 축으로 분리하지 않음).
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
