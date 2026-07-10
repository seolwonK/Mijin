'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const NAV_DEPTH_KEY = 'mijin_nav_depth';

// 브라우저 `history.length`는 about:blank 등 앱 바깥 히스토리 엔트리까지 세어버려
// "딥링크로 막 들어온 상태"를 구분하지 못한다(카카오톡 인앱 브라우저 등에서 새 탭이
// about:blank를 거쳐 열리는 경우 history.length가 이미 2가 됨). 대신 이 탭에서
// 실제로 발생한 앱 내부 pathname 변경 횟수만 sessionStorage에 누적해, 값이
// 0이면 "이 탭에서 앱 내부 이동을 한 번도 하지 않았다"를 결정적으로 판정한다.
export function getNavDepth(): number {
  if (typeof window === 'undefined') return 0;
  try {
    return Number(window.sessionStorage.getItem(NAV_DEPTH_KEY) ?? '0');
  } catch {
    return 0;
  }
}

function bumpNavDepth() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(NAV_DEPTH_KEY, String(getNavDepth() + 1));
  } catch {
    // sessionStorage 접근 불가(프라이빗 모드 등) — 조용히 무시.
    // 카운터가 그대로 0으로 남아 BackButton은 안전한 fallback 쪽으로 판정한다.
  }
}

// pathname이 최초 마운트 이후 실제로 바뀔 때마다 카운터를 1씩 증가시킨다.
// 최초 마운트 시점의 pathname은 "이동"이 아니므로 카운트하지 않는다.
export function useNavDepthTracker() {
  const pathname = usePathname();
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    bumpNavDepth();
  }, [pathname]);
}

// 루트 레이아웃(서버 컴포넌트)에서 훅을 마운트하기 위한 화면 출력 없는 클라이언트 컴포넌트.
export default function NavDepthTracker() {
  useNavDepthTracker();
  return null;
}
