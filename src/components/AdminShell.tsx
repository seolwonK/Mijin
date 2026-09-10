'use client';

import Link from 'next/link';
import { Suspense, useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { usePolling } from '@/components/usePolling';
import LogoutButton from '@/components/LogoutButton';
import BrandLogo from '@/components/BrandLogo';
import AdminDrawer from '@/components/AdminDrawer';
import AdminWorkspaceTabs, { clearAdminWorkspace } from '@/components/AdminWorkspaceTabs';
import { ADMIN_GROUPS, isAdminLinkActive } from './admin-navigation';
import { ChevronDownIcon, SearchIcon } from '@/components/icons';
import styles from '@/components/admin-shell.module.css';

function AdminNavigation({ pathname, badges, onNavigate }: { pathname: string; badges: Record<string, number>; onNavigate?: () => void }) {
  const [collapsed, setCollapsed] = useState<Record<string, string>>(pathname.startsWith('/admin/analytics') ? {} : { analytics: pathname });
  const [query, setQuery] = useState('');
  const navId = useId();
  const normalizedQuery = query.trim().replace(/\s/g, '').toLowerCase();
  const groups = ADMIN_GROUPS.map(group => ({ ...group, items: group.items.filter(item =>
    `${group.label}${item.label}${'tabLabel' in item ? item.tabLabel : ''}`.replace(/\s/g, '').toLowerCase().includes(normalizedQuery),
  ) })).filter(group => group.items.length);
  function navigate() { setQuery(''); onNavigate?.(); }
  return <>
    <div className={styles.brand}><Link href="/admin" onNavigate={navigate}><BrandLogo tone="inverse" size="sm" /></Link><span>업무 시스템</span></div>
    <div className={styles.menuSearch}><SearchIcon /><input type="search" value={query} onChange={event => setQuery(event.target.value)} aria-label="업무 메뉴 검색" placeholder="메뉴 검색" onKeyDown={event => { if (event.key === 'Escape' && query) { event.preventDefault(); event.stopPropagation(); setQuery(''); } }} /></div>
    <div className={styles.menuHeading}><span>업무 메뉴</span><span>{groups.reduce((count, group) => count + group.items.length, 0)}</span></div>
    <nav className={styles.nav} aria-label="관리자 이동">
      {groups.map(group => {
        const containsActive = group.items.some(item => isAdminLinkActive(pathname, item.href));
        const expanded = !!normalizedQuery || !(group.id in collapsed) || (containsActive && collapsed[group.id] !== pathname);
        const groupId = `${navId}-${group.id}`;
        return <div key={group.id} className={styles.group} onKeyDown={event => {
          if (event.key === 'Escape' && expanded && !normalizedQuery) {
            event.preventDefault(); event.stopPropagation();
            setCollapsed(previous => ({ ...previous, [group.id]: pathname }));
            event.currentTarget.querySelector('button')?.focus();
          }
        }}>
          <button type="button" className={styles.groupToggle} aria-expanded={expanded} aria-controls={groupId}
            disabled={!!normalizedQuery} onClick={() => setCollapsed(previous => {
              const next = { ...previous };
              if (expanded) next[group.id] = pathname; else delete next[group.id];
              return next;
            })}>
            <ChevronDownIcon className={expanded ? styles.chevronOpen : styles.chevron} /><span>{group.label}</span>
          </button>
          <div id={groupId} className={styles.subnav} hidden={!expanded}>
            {group.items.map(item => <Link key={item.href} href={item.href} onNavigate={navigate} aria-current={isAdminLinkActive(pathname, item.href) ? 'page' : undefined} className={styles.navLink}>
              <span>{item.label}</span>{!!badges[item.href] && <span className={styles.count} aria-label={`승인 대기 ${badges[item.href]}건`}>{badges[item.href]}</span>}
            </Link>)}
          </div>
        </div>;
      })}
      {!groups.length && <p className={styles.noMenu} role="status">일치하는 메뉴가 없습니다.</p>}
    </nav>
    <div className={styles.account}><span className={styles.accountMark} aria-hidden="true">관</span><div><strong>관리자</strong><span>전기아저씨 관제</span></div><LogoutButton loginPath="/admin/login" /></div>
  </>;
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const isLogin = pathname === '/admin/login';
  const isPrint = pathname.endsWith('/contract/print');
  const { data: providers } = usePolling<{ providers: { approvalStatus: string }[] }>(isLogin || isPrint ? null : '/api/admin/providers', 30_000);
  const { data: technicians } = usePolling<{ technicians: { approvalStatus: string }[] }>(isLogin || isPrint ? null : '/api/admin/technicians', 30_000);
  const badges = {
    '/admin/providers': providers?.providers.filter(p => p.approvalStatus === 'PENDING').length ?? 0,
    '/admin/technicians': technicians?.technicians.filter(t => t.approvalStatus === 'PENDING').length ?? 0,
  };
  function closeMenu() { setMenuOpen(false); requestAnimationFrame(() => menuTrigger.current?.focus()); }
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1280px)');
    const closeOnWide = () => { if (media.matches) setMenuOpen(false); };
    media.addEventListener('change', closeOnWide);
    return () => media.removeEventListener('change', closeOnWide);
  }, []);
  useEffect(() => { if (isLogin) clearAdminWorkspace(); }, [isLogin]);
  if (isLogin || isPrint) return <>{children}</>;
  return <div className={styles.shell} data-nav-collapsed={sidebarCollapsed}>
    <a href="#admin-content" className={styles.skip}>본문으로 건너뛰기</a>
    <aside data-print-hide className={styles.sidebar} aria-label="관리자 메뉴"><AdminNavigation pathname={pathname} badges={badges} /></aside>
    <header data-print-hide className={styles.mobileHeader}><Link href="/admin"><BrandLogo size="sm" /></Link><button ref={menuTrigger} type="button" onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} aria-label="관리자 메뉴 열기"><span aria-hidden="true" className={styles.menuIcon} />메뉴</button></header>
    {menuOpen && <AdminDrawer label="관리자 메뉴" className={styles.drawer} onClose={closeMenu}><button type="button" className={styles.close} onClick={closeMenu} aria-label="관리자 메뉴 닫기">닫기 ×</button><AdminNavigation key={pathname} pathname={pathname} badges={badges} onNavigate={() => setMenuOpen(false)} /></AdminDrawer>}
    <div className={styles.workbar} data-print-hide>
      <button type="button" className={styles.sidebarToggle} onClick={() => setSidebarCollapsed(!sidebarCollapsed)} aria-label={sidebarCollapsed ? '업무 메뉴 펼치기' : '업무 메뉴 접기'} aria-expanded={!sidebarCollapsed} title={sidebarCollapsed ? '업무 메뉴 펼치기' : '업무 메뉴 접기'}><span aria-hidden="true">{sidebarCollapsed ? '›' : '‹'}</span></button>
      <Suspense fallback={<div className={styles.tabsLoading}>대시보드</div>}><AdminWorkspaceTabs /></Suspense>
    </div>
    <div id="admin-content" className={styles.content} tabIndex={-1}>{children}</div>
  </div>;
}
