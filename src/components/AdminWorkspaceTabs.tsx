'use client';

import Link from 'next/link';
import { useEffect, useRef, useSyncExternalStore, type KeyboardEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { adminView } from './admin-navigation';
import styles from './admin-shell.module.css';

const STORAGE_KEY = 'mijin.admin.workspace.v1';
const HOME = adminView('/admin')!;
type WorkspaceTab = typeof HOME;
const INITIAL: WorkspaceTab[] = [HOME];
let snapshot = INITIAL;
let loaded = false;
const listeners = new Set<() => void>();

function revealTab(container: HTMLElement, tab: HTMLElement) {
  const left = tab.getBoundingClientRect().left - container.getBoundingClientRect().left + container.scrollLeft;
  if (left < container.scrollLeft) container.scrollLeft = left;
  else if (left + tab.offsetWidth > container.scrollLeft + container.clientWidth) container.scrollLeft = left + tab.offsetWidth - container.clientWidth;
}

function publish(tabs: WorkspaceTab[]) {
  snapshot = tabs;
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tabs.map(tab => tab.href))); } catch { /* In-memory tabs still work if storage is unavailable. */ }
  listeners.forEach(listener => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!loaded) {
    loaded = true;
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '[]');
      if (Array.isArray(saved)) {
        const tabs = new Map<string, WorkspaceTab>([[HOME.path, HOME]]);
        for (const href of saved.slice(0, 100)) {
          const tab = typeof href === 'string' ? adminView(href) : null;
          if (tab) tabs.set(tab.path, tab);
        }
        snapshot = [...tabs.values()];
      }
    } catch { /* Ignore outdated or invalid saved state. */ }
  }
  return () => { listeners.delete(listener); };
}
function remember(href: string) {
  const tab = adminView(href);
  if (!tab) return;
  const index = snapshot.findIndex(item => item.path === tab.path);
  if (index >= 0 && snapshot[index].href === tab.href) return;
  publish(index < 0 ? [...snapshot, tab] : snapshot.map((item, i) => i === index ? tab : item));
}
export function clearAdminWorkspace() {
  loaded = true;
  publish(INITIAL);
}

export default function AdminWorkspaceTabs() {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const tabs = useSyncExternalStore(subscribe, () => snapshot, () => INITIAL);
  const strip = useRef<HTMLOListElement>(null);
  const options = useRef<HTMLDetailsElement>(null);
  const href = pathname + (params.size ? `?${params.toString()}` : '');

  useEffect(() => {
    const update = () => remember(href + window.location.hash);
    update();
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, [href]);

  useEffect(() => {
    // Scroll only the tab strip, leaving the page and its own scroll containers alone.
    const container = strip.current;
    const active = container?.querySelector<HTMLElement>('[data-active="true"]');
    if (!container || !active) return;
    revealTab(container, active);
  }, [pathname, tabs]);

  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (options.current && !options.current.contains(event.target as Node)) options.current.open = false;
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);

  function focusTab(path: string) {
    requestAnimationFrame(() => {
      const link = Array.from(strip.current?.querySelectorAll<HTMLAnchorElement>('a') ?? []).find(link => link.dataset.path === path);
      link?.focus({ preventScroll: true });
      if (strip.current && link?.parentElement) revealTab(strip.current, link.parentElement);
    });
  }
  function closeTab(path: string) {
    if (path === HOME.path) return;
    const index = tabs.findIndex(tab => tab.path === path);
    const adjacent = tabs[index - 1] ?? tabs[index + 1] ?? HOME;
    publish(tabs.filter(tab => tab.path !== path));
    if (path === pathname) router.replace(adjacent.href, { scroll: false });
    focusTab(path === pathname ? adjacent.path : pathname);
  }
  function handleKeys(event: KeyboardEvent<HTMLAnchorElement>, index: number) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
    if (target !== null) { event.preventDefault(); focusTab(tabs[target].path); }
    if (event.key === 'Delete' && tabs[index].path !== HOME.path) { event.preventDefault(); closeTab(tabs[index].path); }
  }
  function closeOthers() {
    publish(tabs.filter(tab => tab.path === HOME.path || tab.path === pathname));
    if (options.current) options.current.open = false;
    focusTab(pathname);
  }

  return <nav className={styles.workspaceTabs} aria-label="열린 업무">
    <ol ref={strip} className={styles.tabList}>
      {tabs.map((tab, index) => <li key={tab.path} className={styles.workTab} data-active={tab.path === pathname}>
        <Link href={tab.href} prefetch={false} scroll={false} data-path={tab.path}
          aria-current={tab.path === pathname ? 'page' : undefined}
          onKeyDown={event => handleKeys(event, index)}>
          {tab.path === HOME.path && <span className={styles.homeGlyph} aria-hidden="true">⌂</span>}
          <span>{tab.label}</span>
          {tabs.filter(item => item.label === tab.label).length > 1 && <small>{tabs.filter(item => item.label === tab.label).findIndex(item => item.path === tab.path) + 1}</small>}
        </Link>
        {tab.path !== HOME.path && <button type="button" className={styles.tabClose} onClick={() => closeTab(tab.path)} aria-label={`${tab.label} 탭 닫기`} title="탭 닫기"><span aria-hidden="true">×</span></button>}
      </li>)}
    </ol>
    <details ref={options} className={styles.tabOptions} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); }
    }}>
      <summary aria-label="열린 업무 목록" title="열린 업무 목록"><span aria-hidden="true">⌄</span><span className={styles.tabTotal}>{tabs.length}</span></summary>
      <div className={styles.tabPopover}>
        <div className={styles.popoverHeading}><strong>열린 업무 <span>{tabs.length}</span></strong><button type="button" onClick={closeOthers} disabled={tabs.every(tab => tab.path === HOME.path || tab.path === pathname)}>다른 탭 닫기</button></div>
        <ul>{tabs.map(tab => <li key={tab.path}><Link href={tab.href} prefetch={false} scroll={false} aria-current={tab.path === pathname ? 'page' : undefined} onNavigate={() => { if (options.current) options.current.open = false; }}>{tab.label}</Link></li>)}</ul>
      </div>
    </details>
  </nav>;
}
