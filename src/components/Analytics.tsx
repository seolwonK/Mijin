'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

// GA4(gtag.js) 로더. 측정 ID 는 /api/site-config 로 런타임에 받는다(route.ts 주석 참조).
// GA_MEASUREMENT_ID 가 비어 있으면 아무것도 하지 않는다 — 로컬·E2E 에서 외부 요청이 나가지 않는다.
//
// 네이버 애널리틱스(wcslog.js)도 여기서 같이 싣는다. 발급 ID 는 페이지 소스에 그대로 노출되는 공개 값이라
// 환경변수 대신 상수로 두고, 대신 정식 도메인에서만 동작시켜 로컬·E2E·CloudType 원본 호스트에서는
// 외부 요청이 나가지 않게 한다. 네이버 검색어별 유입은 GA4 보다 이쪽 리포트가 정확하다.
const NAVER_ANALYTICS_ID = '18d2fdc10e42f80'; // analytics.naver.com · nqs 계정 · 사이트 '전기아저씨'
const NAVER_ANALYTICS_HOSTS = ['xn--ok0bp94bnc26kra.com', 'www.xn--ok0bp94bnc26kra.com'];

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    wcs_add?: Record<string, string>;
    wcs?: unknown;
    wcs_do?: () => void;
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

  // 네이버 애널리틱스: 공식 스니펫(wcslog.js 로드 → wcs_add.wa 설정 → wcs_do())을 정식 도메인에서만 실행.
  const naverLoadedRef = useRef(false);
  useEffect(() => {
    if (!NAVER_ANALYTICS_HOSTS.includes(window.location.hostname) || naverLoadedRef.current) return;
    naverLoadedRef.current = true;
    window.wcs_add = window.wcs_add || {};
    window.wcs_add.wa = NAVER_ANALYTICS_ID;
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://wcs.pstatic.net/wcslog.js';
    s.onload = () => { if (window.wcs && window.wcs_do) window.wcs_do(); };
    document.body.appendChild(s);
  }, []);

  // App Router 클라이언트 내비게이션은 페이지를 다시 로드하지 않으므로 경로가 바뀔 때 page_view 를 직접 보낸다.
  useEffect(() => {
    if (skipFirstRef.current) { skipFirstRef.current = false; return; }
    if (idRef.current && window.gtag) {
      window.gtag('event', 'page_view', {
        page_path: pathname,
        page_location: window.location.href,
        page_title: document.title,
      });
    }
    // 네이버 애널리틱스도 가상 페이지뷰를 다시 기록한다(스크립트가 아직 안 실렸으면 onload 가 첫 PV 를 보낸다).
    if (naverLoadedRef.current && window.wcs && window.wcs_do) window.wcs_do();
  }, [pathname]);

  return null;
}
