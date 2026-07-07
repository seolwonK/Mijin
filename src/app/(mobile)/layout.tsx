// 고객·업체용 프레임
// 모바일: 휴대폰 폭 단일 컬럼(흰 시트) / PC(md+): 시트 제약을 풀고 페이지별 레이아웃이 폭을 결정
export default function MobileLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-white shadow-sm md:max-w-none md:bg-transparent md:shadow-none">
      {children}
    </div>
  );
}
