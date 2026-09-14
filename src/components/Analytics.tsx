'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

// GA4(gtag.js) 로더. 측정 ID 는 /api/site-config 로 런타임에 받는다(route.ts 주석 참조).
// GA_MEASUREMENT_ID 가 비어 있으면 아무것도 하지 않는다 — 로컬·E2E 에서 외부 요청이 나가지 않는다.
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export default function Analytics() {
  const pathname = usePathname();
  const idRef = useRef<string | null>(null);
  const skipFirstRef = useRef(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/site-config')
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg: { gaMeasurementId?: string | null } | null) => {
        const id = cfg?.gaMeasurementId;
        if (cancelled || !id || idRef.current) return;
        idRef.current = id;
        window.dataLayer = window.dataLayer || [];
        // gtag.js 는 dataLayer 에 Arguments 객체가 들어오길 기대한다(공식 스니펫과 동일).
        // eslint-disable-next-line prefer-rest-params
        window.gtag = function gtag() { window.dataLayer!.push(arguments); };
        window.gtag('js', new Date());
        window.gtag('config', id);
        const s = document.createElement('script');
        s.async = true;
        s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
        document.head.appendChild(s);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // App Router 클라이언트 내비게이션은 페이지를 다시 로드하지 않으므로 경로가 바뀔 때 page_view 를 직접 보낸다.
  useEffect(() => {
    if (skipFirstRef.current) { skipFirstRef.current = false; return; }
    if (!idRef.current || !window.gtag) return;
    window.gtag('event', 'page_view', {
      page_path: pathname,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [pathname]);

  return null;
}
