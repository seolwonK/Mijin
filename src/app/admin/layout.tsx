// 관리자 프레임 — 데스크톱(PC)에서 넓은 화면을 활용하도록 max-w-6xl까지 확장.
// 모바일에서는 화면 폭 그대로(단일 컬럼)라 휴대폰에서도 그대로 사용 가능.
export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-6xl bg-white shadow-sm">
      {children}
    </div>
  );
}
