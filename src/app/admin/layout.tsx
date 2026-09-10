// 관리자 공통 프레임: 업무 탭과 메뉴 트리. 1280px 미만은 메뉴 서랍.
// 로그인·계약서 인쇄 경로는 프레임을 생략하고, 인쇄 시 메뉴와 본문 여백을 제거한다.
import AdminShell from '@/components/AdminShell';

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AdminShell>{children}</AdminShell>;
}
