'use client';

import { useRouter } from 'next/navigation';
import { getNavDepth } from './useNavDepthTracker';

// 모바일 헤더용 뒤로가기 — 44px 터치 영역 확보. 앱 내부 네비게이션 깊이 카운터가
// 1 이상이면(이 탭에서 실제로 화면 이동을 한 적이 있으면) 진짜 뒤로가기, 0이면
// (딥링크로 바로 들어온 경우) fallback 경로로 이동. `history.length`는 about:blank
// 등 앱 바깥 엔트리까지 세어 딥링크 진입을 구분 못 하므로 쓰지 않는다
// (useNavDepthTracker.ts 참조).
export default function BackButton({
  fallback,
  tone = 'default',
}: {
  fallback: string;
  tone?: 'default' | 'inverse';
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="뒤로가기"
      onClick={() => {
        if (getNavDepth() >= 1) router.back();
        else router.replace(fallback);
      }}
      className={
        tone === 'inverse'
          ? '-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl text-white/90 transition active:scale-90 active:bg-white/10'
          : '-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl text-neutral-700 transition active:scale-90 active:bg-neutral-100'
      }
    >
      ←
    </button>
  );
}
