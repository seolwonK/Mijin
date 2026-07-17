'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePolling } from '@/components/usePolling';
import LogoutButton from '@/components/LogoutButton';

// 관리자 셸 — 상단 탭으로 주요 관리 화면을 이동한다.
// 데스크톱(md+) 전용 — 모바일은 각 admin 페이지가 보유한 인라인 내비를 그대로 쓴다(변경 없음).
// children을 감싸는 구조라 폴링 훅은 뷰포트와 무관하게 항상 1회만 마운트된다(중복 요청 방지).
const NAV = [
  { href: '/admin', label: '대시보드' },
  { href: '/admin/providers', label: '업체 관리' },
  { href: '/admin/technicians', label: '기술자 관리' },
  { href: '/admin/rotation', label: '순환 현황' },
  { href: '/admin/commissions', label: '정산' },
  { href: '/admin/settings', label: '설정' },
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
      <div data-print-hide className="hidden border-b border-border bg-white md:block">
        <header className="flex h-11 items-center gap-1 px-4 text-fg">
          <span className="mr-3 flex items-center gap-2 text-sm font-bold">
            <span className="flex h-6 w-6 items-center justify-center rounded-admin-sm bg-brand-50 text-brand-600">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
              </svg>
            </span>
            관제탑
          </span>
          <nav className="flex h-11 items-center gap-0.5" aria-label="관리자 이동">
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
                  className={`flex h-11 items-center gap-2 border-b-2 px-3 text-[13px] font-semibold transition-colors md:text-[14px] ${
                    active
                      ? 'border-brand-600 text-fg'
                      : 'border-transparent text-muted hover:text-fg'
                  }`}
                >
                  {n.label}
                  {count > 0 && (
                    <span className="font-mono text-[11px] font-bold text-brand-600">
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

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
