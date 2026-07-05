'use client';

import { useCallback, useEffect, useState } from 'react';

// url이 null이면 폴링하지 않는다.
export function usePolling<T>(url: string | null, intervalMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!url) return;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 401) {
          window.location.reload(); // 세션 만료 → 미들웨어가 로그인으로 보냄
          return;
        }
        throw new Error(`요청 실패 (${res.status})`);
      }
      setData(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [url]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, intervalMs);
    return () => clearInterval(timer);
  }, [refresh, intervalMs]);

  return { data, error, refresh };
}
