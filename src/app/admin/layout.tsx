// 관리자 프레임 — 데스크톱(PC)에서는 좌측 고정 사이드바 + 넓은 콘텐츠 영역.
// 모바일(md 미만)에서는 사이드바를 숨기고 화면 폭 그대로(단일 컬럼) 사용한다.
import AdminSidebar from '@/components/AdminSidebar';

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-white md:flex">
      {/* 인쇄 시 항상 숨김 — md:flex 브레이크포인트는 뷰포트 폭 기준이라 인쇄 페이지 폭이
          우연히 768px를 넘으면 사이드바가 그대로 인쇄될 수 있다(재현: contract/print 데스크톱
          인쇄 캡처). contents로 감싸 화면 레이아웃(sticky/flex 자식 크기)은 그대로 두고,
          data-print-hide만 인쇄 매체에서 무조건 display:none 처리한다. */}
      <div data-print-hide className="contents">
        <AdminSidebar />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
