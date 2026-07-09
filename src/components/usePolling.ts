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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [url, router]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, intervalMs);
    return () => clearInterval(timer);
  }, [refresh, intervalMs]);

  return { data, error, refresh };
}
