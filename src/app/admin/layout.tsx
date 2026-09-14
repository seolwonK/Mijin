// 관리자 공통 프레임: 업무 탭과 메뉴 트리. 1280px 미만은 메뉴 서랍.
// 로그인·계약서 인쇄 경로는 프레임을 생략하고, 인쇄 시 메뉴와 본문 여백을 제거한다.
import AdminShell from '@/components/AdminShell';
import type { Metadata } from 'next';

// 관리자 화면은 검색 색인 대상이 아니다. robots.txt 의 /admin Disallow 와 함께 이중으로 막는다.
export const metadata: Metadata = {
  title: '관리자',
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AdminShell>{children}</AdminShell>;
}
