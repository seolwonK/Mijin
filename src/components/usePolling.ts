'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// 세션 만료(401) 시 돌아갈 로그인 경로를 현재 위치로 판별
function loginPathFor(pathname: string): string {
  if (pathname.startsWith('/admin')) return '/admin/login';
  if (pathname.startsWith('/tech')) return '/tech/login';
  if (pathname.startsWith('/partner')) return '/partner/login';
  return '/';
}

// url이 null이면 폴링하지 않는다.
export function usePolling<T>(url: string | null, intervalMs: number) {
  const router = useRouter();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 마지막으로 성공 응답을 받은 시각 (ms epoch) — 실패/401 시에는 갱신하지 않는다.
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!url) return;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 401) {
          // 세션 만료 — 하드 리로드(깜빡임) 대신 현재 위치를 기억해 로그인으로 부드럽게 이동
          const path = window.location.pathname;
          const loginPath = loginPathFor(path);
          if (path !== loginPath) {
            router.replace(
              `${loginPath}?returnTo=${encodeURIComponent(path + window.location.search)}`,
            );
          }
          return;
        }
        throw new Error(`요청 실패 (${res.status})`);
      }
      setData(await res.json());
      setError(null);
      setLastUpdatedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [url, router]);

  useEffect(() => {
    // 마운트 시 1회 즉시 갱신 (survey/lookup의 load() 패턴과 동일)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // 백그라운드 탭에서는 폴링을 쉬고(배터리·서버 절약), 복귀 즉시 한 번 갱신한다.
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, intervalMs);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, intervalMs]);

  return { data, error, refresh, lastUpdatedAt };
}
