'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// 세션 만료(401) 시 돌아갈 로그인 경로를 현재 위치로 판별
function loginPathFor(pathname: string): string {
  if (pathname.startsWith('/admin')) return '/admin/login';
  if (pathname.startsWith('/tech')) return '/tech/login';
  if (pathname.startsWith('/partner')) return '/partner/login';
  return '/';
}

// url이 null이면 폴링하지 않는다.
// URL은 데이터 identity 경계다 — 상태는 그것을 만든 url과 함께 저장되고,
// 반환값은 현재 url과 일치할 때만 노출된다(전환 커밋 1프레임의 이전 대상 표시 차단).
// 느리게 도착한 이전 URL 응답은 세대(generation) 가드로 폐기한다.
type PollingState<T> = {
  url: string | null;
  data: T | null;
  error: string | null;
  // 마지막으로 성공 응답을 받은 시각 (ms epoch) — 실패/401 시에는 갱신하지 않는다.
  lastUpdatedAt: number | null;
};

export function usePolling<T>(url: string | null, intervalMs: number) {
  const router = useRouter();
  const [state, setState] = useState<PollingState<T>>({
    url,
    data: null,
    error: null,
    lastUpdatedAt: null,
  });
  const generationRef = useRef(0);

  useEffect(() => {
    // url 변경 = 다른 대상(identity) — 지연 도착한 이전 URL 응답의 상태 갱신을 차단한다.
    generationRef.current += 1;
  }, [url]);

  const refresh = useCallback(async () => {
    if (!url) return;
    const generation = generationRef.current;
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
      const body = (await res.json()) as T;
      if (generation !== generationRef.current) return; // 이전 URL 응답 — 폐기
      setState({ url, data: body, error: null, lastUpdatedAt: Date.now() });
    } catch (e) {
      if (generation !== generationRef.current) return; // 이전 URL 응답 — 폐기
      const message = e instanceof Error ? e.message : String(e);
      setState((prev) => ({
        url,
        data: prev.url === url ? prev.data : null,
        error: message,
        lastUpdatedAt: prev.url === url ? prev.lastUpdatedAt : null,
      }));
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

  // identity 게이트 — 저장된 상태가 현재 url의 것일 때만 노출한다(전환 1프레임 stale 차단).
  const current = state.url === url;
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    refresh,
    lastUpdatedAt: current ? state.lastUpdatedAt : null,
  };
}
