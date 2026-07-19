'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { usePolling } from '@/components/usePolling';
import LogoutButton from '@/components/LogoutButton';

// 관리자 셸 — 상단 탭으로 주요 관리 화면을 이동한다.
// 데스크톱(md+) 전용 — 모바일은 각 admin 페이지가 보유한 인라인 내비를 그대로 쓴다(변경 없음).
// children을 감싸는 구조라 폴링 훅은 뷰포트와 무관하게 항상 1회만 마운트된다(중복 요청 방지).
type NavItem = {
  label: string;
  href?: string;
  children?: { href: string; label: string }[];
};

const NAV: NavItem[] = [
  { href: '/admin', label: '대시보드' },
  { href: '/admin/providers', label: '업체 관리' },
  { href: '/admin/technicians', label: '기술자 관리' },
  { href: '/admin/rotation', label: '순환 현황' },
  { href: '/admin/commissions', label: '정산' },
  { href: '/admin/settlements', label: '정산 집계' },
  { label: '분석', children: [{ href: '/admin/analytics/dashboard', label: '현황' }, { href: '/admin/analytics/map', label: '지도' }, { href: '/admin/analytics/surveys', label: '설문' }, { href: '/admin/analytics/ratings', label: '평점' }] },
  { href: '/admin/settings', label: '설정' },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const [openNav, setOpenNav] = useState<string | null>(null);
  const navButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const navItemRefs = useRef<Record<string, (HTMLAnchorElement | null)[]>>({});
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
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenNav(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
              const active = n.href
                ? n.href === '/admin'
                  ? pathname === '/admin' || pathname.startsWith('/admin/requests')
                  : pathname.startsWith(n.href)
                : n.children?.some((child) => pathname.startsWith(child.href)) ?? false;
              const count = n.href ? badge[n.href] ?? 0 : 0;

              if (n.children) {
                const open = openNav === n.label;
                return (
                  <div
                    key={n.label}
                    className="relative hidden lg:block"
                    onMouseEnter={() => setOpenNav(n.label)}
                    onMouseLeave={() => setOpenNav(null)}
                  >
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-haspopup="menu"
                      aria-controls={`admin-nav-${n.label}`}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => setOpenNav(open ? null : n.label)}
                      onKeyDown={(event) => {
                        if (event.key !== 'ArrowDown') return;
                        event.preventDefault();
                        setOpenNav(n.label);
                        requestAnimationFrame(() => navItemRefs.current[n.label]?.[0]?.focus());
                      }}
                      ref={(element) => {
                        navButtonRefs.current[n.label] = element;
                      }}
                      className={`flex h-11 items-center gap-1 border-b-2 px-3 text-[13px] font-semibold transition-colors md:text-[14px] ${
                        active
                          ? 'border-brand-600 text-fg'
                          : 'border-transparent text-muted hover:text-fg'
                      }`}
                    >
                      {n.label}
                      <svg viewBox="0 0 12 12" aria-hidden="true" className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}>
                        <path d="m2.5 4 3.5 3.5L9.5 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    </button>
                    {open && (
                      <div id={`admin-nav-${n.label}`} role="menu" className="absolute top-full left-0 z-30 min-w-28 border border-border bg-white py-1 shadow-card">
                        {n.children.map((child) => {
                          const childActive = pathname.startsWith(child.href);
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              aria-current={childActive ? 'page' : undefined}
                              role="menuitem"
                              ref={(element) => {
                                const items = navItemRefs.current[n.label] ?? [];
                                items[n.children!.indexOf(child)] = element;
                                navItemRefs.current[n.label] = items;
                              }}
                              onKeyDown={(event) => {
                                const items = navItemRefs.current[n.label] ?? [];
                                const index = items.indexOf(event.currentTarget);
                                if (event.key === 'Escape') {
                                  event.preventDefault();
                                  setOpenNav(null);
                                  requestAnimationFrame(() => navButtonRefs.current[n.label]?.focus());
                                  return;
                                }
                                if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                                event.preventDefault();
                                const nextIndex = (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
                                items[nextIndex]?.focus();
                              }}
                              onClick={() => setOpenNav(null)}
                              className={`block px-3 py-2 text-[13px] font-semibold whitespace-nowrap ${
                                childActive
                                  ? 'bg-neutral-100 text-fg'
                                  : 'text-muted hover:bg-neutral-50 hover:text-fg'
                              }`}
                            >
                              {child.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={n.href}
                  href={n.href!}
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
