// 고객·업체용 모바일 프레임 (휴대폰 폭에 맞춘 단일 컬럼)
export default function MobileLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-white shadow-sm">
      {children}
    </div>
  );
}
