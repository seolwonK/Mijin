'use client';

import { useRouter } from 'next/navigation';

// 모바일 헤더용 뒤로가기 — 44px 터치 영역 확보, 방문 이력이 있으면 실제 뒤로가기,
// 딥링크로 바로 들어온 경우엔 fallback 경로로 이동.
export default function BackButton({ fallback }: { fallback: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="뒤로가기"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.replace(fallback);
      }}
      className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl text-neutral-700 active:bg-neutral-100"
    >
      ←
    </button>
  );
}
