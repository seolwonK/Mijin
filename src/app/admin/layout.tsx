// 관리자 프레임 — 데스크톱(PC)에서는 좌측 고정 사이드바 + 넓은 콘텐츠 영역.
// 모바일(md 미만)에서는 사이드바를 숨기고 화면 폭 그대로(단일 컬럼) 사용한다.
import AdminSidebar from '@/components/AdminSidebar';

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-white md:flex">
      <AdminSidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
