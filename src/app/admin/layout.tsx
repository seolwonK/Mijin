// 관리자 프레임 — 라이트 셸: 데스크톱(PC)에서는 상단 탭 단일 내비(승인 배지 포함),
// 모바일(md 미만)에서는 셸을 숨기고 화면 폭 그대로(단일 컬럼) 사용한다.
// 셸 내부의 인쇄 숨김(data-print-hide)은 AdminShell.tsx가 각 조각(상단바/레일)에 개별 적용한다
// (md:flex 브레이크포인트는 뷰포트 폭 기준이라 인쇄 페이지 폭이 우연히 768px를 넘으면 그대로
// 인쇄될 수 있어, contract/print 데스크톱 인쇄 캡처 재현 이력에 따라 무조건 display:none 처리).
import AdminShell from '@/components/AdminShell';

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AdminShell>{children}</AdminShell>;
}
