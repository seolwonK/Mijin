import FloatingDock from '@/components/FloatingDock';

// 고객·업체용 프레임
// 모바일: 휴대폰 폭 단일 컬럼(흰 시트) / PC(md+): 시트 제약을 풀고 페이지별 레이아웃이 폭을 결정
// FloatingDock을 이 그룹 전체(고객+업체+기술자)에 전역 마운트한다 — 컴포넌트 자체가 경로를 보고
// 고객 탐색 화면(`/`, `/lookup`)에서만 스스로를 렌더링하므로(역할 인지·몰입화면 숨김) children을
// 두 번 그리지 않고도 안전하게 항상 마운트해 둘 수 있다.
export default function MobileLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-white shadow-sm md:max-w-none md:bg-transparent md:shadow-none">
      {children}
      <FloatingDock />
    </div>
  );
}
