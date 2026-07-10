'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePolling } from '@/components/usePolling';
import LogoutButton from '@/components/LogoutButton';
import { GridIcon, BuildingIcon, WrenchIcon, GearIcon } from '@/components/icons';

// "관제탑"(B) 관리자 셸 — 기존 AdminSidebar(세로 리스트)를 상단 탭 + 아이콘 레일로 대체한다.
// admin-* 다크 토큰은 이 셸(및 AdminDataTable/AdminInspector/AdminMetricStrip)에서만 쓴다 —
// providers/technicians/settings 등 미마이그레이션 화면은 콘텐츠 영역에서 계속 라이트 톤이라,
// 지금은 다크 셸 아래 라이트 콘텐츠가 이어지는 과도기 상태다(전면 통일은 task #32 C′ 롤아웃).
// 데스크톱(md+) 전용 — 모바일은 각 admin 페이지가 보유한 인라인 내비를 그대로 쓴다(변경 없음).
// children을 감싸는 구조라 폴링 훅은 뷰포트와 무관하게 항상 1회만 마운트된다(중복 요청 방지).
const NAV = [
  { href: '/admin', label: '대시보드', Icon: GridIcon },
  { href: '/admin/providers', label: '업체 관리', Icon: BuildingIcon },
  { href: '/admin/technicians', label: '기술자 관리', Icon: WrenchIcon },
  { href: '/admin/settings', label: '설정', Icon: GearIcon },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/admin/login';
  const { data: provData } = usePolling<{ providers: { approvalStatus: string }[] }>(
    isLoginPage ? null : '/api/admin/providers',
    30_000,
  );
  const { data: techData } = usePolling<{ technicians: { approvalStatus: string }[] }>(
    isLoginPage ? null : '/api/admin/technicians',
    30_000,
  );
  const badge: Record<string, number> = {
    '/admin/providers': (provData?.providers ?? []).filter((p) => p.approvalStatus === 'PENDING')
      .length,
    '/admin/technicians': (techData?.technicians ?? []).filter(
      (t) => t.approvalStatus === 'PENDING',
    ).length,
  };

  if (isLoginPage) return <>{children}</>;

  return (
    <div className="min-h-screen bg-white md:flex md:flex-col">
      <div data-print-hide className="hidden border-b border-admin-border bg-admin-bg md:block">
        <header className="flex h-13 items-center gap-1 px-4 text-admin-ink">
          <span className="mr-3 flex items-center gap-2 text-sm font-bold">
            <span className="flex h-6 w-6 items-center justify-center rounded-admin-sm bg-admin-cyan/15 text-admin-cyan">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
              </svg>
            </span>
            관제탑
          </span>
          <nav className="flex h-13 items-center gap-0.5" aria-label="관리자 이동">
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
                  className={`flex h-13 items-center gap-2 border-b-2 px-3 text-[13px] font-semibold transition-colors ${
                    active
                      ? 'border-admin-cyan text-admin-ink'
                      : 'border-transparent text-admin-dim hover:text-admin-ink'
                  }`}
                >
                  {n.label}
                  {count > 0 && (
                    <span className="font-mono text-[11px] font-bold text-admin-cyan">
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto">
            <LogoutButton loginPath="/admin/login" />
          </div>
        </header>
      </div>

      <div className="md:flex md:flex-1">
        <nav
          data-print-hide
          aria-label="관리자 빠른 이동"
          className="sticky top-13 hidden h-[calc(100vh-3.25rem)] w-13 shrink-0 flex-col items-center gap-2 border-r border-admin-border bg-admin-bg py-3 md:flex"
        >
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
                aria-label={n.label}
                aria-current={active ? 'page' : undefined}
                className={`relative flex h-9 w-9 items-center justify-center rounded-admin-md ${
                  active ? 'bg-admin-cyan/15 text-admin-cyan' : 'text-admin-dim hover:text-admin-ink'
                }`}
              >
                <n.Icon className="h-[18px] w-[18px]" />
                {count > 0 && (
                  <span className="absolute top-0.5 right-0.5 h-[15px] w-[15px] rounded-full bg-admin-red text-[9px] font-bold text-admin-bg">
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
