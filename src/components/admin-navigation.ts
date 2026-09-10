export const ADMIN_GROUPS = [
  { id: 'operations', label: '접수 운영', items: [
    { href: '/admin', label: '대시보드' },
    { href: '/admin/rotation', label: '순환 현황' },
  ] },
  { id: 'partners', label: '파트너 관리', items: [
    { href: '/admin/providers', label: '업체 관리' },
    { href: '/admin/technicians', label: '전기기사 관리' },
  ] },
  { id: 'finance', label: '정산', items: [
    { href: '/admin/commissions', label: '정산' },
    { href: '/admin/settlements', label: '정산 집계' },
  ] },
  { id: 'analytics', label: '분석', items: [
    { href: '/admin/analytics/dashboard', label: '현황', tabLabel: '운영 현황' },
    { href: '/admin/analytics/map', label: '지도', tabLabel: '전국 지도' },
    { href: '/admin/analytics/surveys', label: '설문', tabLabel: '고객 설문' },
    { href: '/admin/analytics/ratings', label: '평점', tabLabel: '평점 분석' },
  ] },
  { id: 'settings', label: '시스템', items: [{ href: '/admin/settings', label: '설정' }] },
] as const;

export function isAdminLinkActive(pathname: string, href: string) {
  return href === '/admin'
    ? pathname === '/admin' || pathname.startsWith('/admin/requests/')
    : pathname === href || pathname.startsWith(`${href}/`);
}

/** Also validates restored workspace URLs before passing them to Next's router. */
export function adminView(href: string): { path: string; href: string; label: string } | null {
  if (!href.startsWith('/admin') || /[\\\s]/.test(href)) return null;
  const url = new URL(href, 'https://admin.local');
  if (url.origin !== 'https://admin.local') return null;
  const path = url.pathname;
  for (const group of ADMIN_GROUPS) {
    for (const item of group.items) {
      if (item.href === path) return { path, href: path + url.search + url.hash, label: 'tabLabel' in item ? item.tabLabel : item.label };
    }
  }
  const match = path.match(/^\/admin\/(requests|providers|technicians)\/([a-zA-Z0-9_-]+)(\/contract)?$/);
  if (!match || (match[3] && match[1] !== 'technicians')) return null;
  const label = match[3] ? '기사 계약서'
    : match[1] === 'requests' ? '접수 상세'
    : match[1] === 'providers' ? (match[2] === 'new' ? '업체 등록' : '업체 상세')
    : match[2] === 'new' ? '기사 등록' : '기사 상세';
  return { path, href: path + url.search + url.hash, label };
}
