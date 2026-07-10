// 카드형 표면 프리미티브 — border + 토큰 shadow 번들.
// 실측 근거: .omc/research/elevation-audit.md §3 — `border border-border ... shadow-card` 조합이
// 29곳에서 반복(전량 border 동반, border 없이 shadow만 쓰는 위험 콜사이트 0건). radius/padding/레이아웃은
// 화면마다 의도적으로 다르므로(rounded-2xl vs 3xl, p-4~p-12 등) 강제하지 않고 className으로 그대로 받는다.
// Link 등 <div>가 아닌 요소에 카드 스타일이 필요하면 cardClasses()를 직접 사용(Button.tsx의
// buttonClasses() 헬퍼와 동일한 패턴).
export function cardClasses(extra = '') {
  return `border border-border bg-white shadow-card ${extra}`.trim();
}

export default function Card({
  as: Tag = 'div',
  className = '',
  ...props
}: {
  as?: 'div' | 'section';
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  const Component = Tag;
  return <Component className={cardClasses(className)} {...props} />;
}
