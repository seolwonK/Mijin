'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePolling } from '@/components/usePolling';
import LogoutButton from '@/components/LogoutButton';

// 데스크톱 전용 좌측 고정 사이드바. 관리자가 대시보드를 경유하지 않고 섹션 간
// 직접 이동할 수 있게 한다. 모바일(md 미만)에서는 숨기고 각 페이지의 헤더를 그대로 쓴다.
const NAV = [
  { href: '/admin', label: '대시보드', icon: '📋' },
  { href: '/admin/providers', label: '업체 관리', icon: '🏢' },
  { href: '/admin/technicians', label: '기술자 관리', icon: '🔧' },
  { href: '/admin/settings', label: '설정', icon: '⚙️' },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  // 로그인 화면(미인증)에서는 폴링하면 401 → usePolling이 window.location.reload()를
  // 반복해 화면이 깜빡이고 입력 중 키보드가 닫힌다. 로그인 화면에선 폴링·렌더 모두 끈다.
  const isLoginPage = pathname === '/admin/login';
  const { data: provData } = usePolling<{
    providers: { approvalStatus: string }[];
  }>(isLoginPage ? null : '/api/admin/providers', 30_000);
  const { data: techData } = usePolling<{
    technicians: { approvalStatus: string }[];
  }>(isLoginPage ? null : '/api/admin/technicians', 30_000);
  const badge: Record<string, number> = {
    '/admin/providers': (provData?.providers ?? []).filter(
      (p) => p.approvalStatus === 'PENDING',
    ).length,
    '/admin/technicians': (techData?.technicians ?? []).filter(
      (t) => t.approvalStatus === 'PENDING',
    ).length,
  };

  if (isLoginPage) return null;

  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-gray-200 bg-white md:flex">
      <div className="border-b border-gray-100 px-5 py-4">
        <p className="text-base font-bold">⚡ 미진전기</p>
        <p className="text-xs text-gray-500">관리자 콘솔</p>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {NAV.map((n) => {
          const active =
            n.href === '/admin'
              ? pathname === '/admin' || pathname.startsWith('/admin/requests')
              : pathname.startsWith(n.href);
          const count = badge[n.href] ?? 0;
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                active ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="text-lg">{n.icon}</span>
              <span className="flex-1">{n.label}</span>
              {count > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-gray-100 p-3">
        <LogoutButton loginPath="/admin/login" />
      </div>
    </aside>
  );
}
