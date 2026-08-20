'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';

export type RequestPhotoRef = { id: string; mime: string };

/**
 * 접수에 첨부된 고장 현장 사진 뷰어 (관리자·업체·전기기사 공용).
 *
 * 이미지 원본은 권한 검사 라우트에서만 나오므로 next/image 최적화(`/_next/image`)를 태우지
 * 않는다 — 최적화 서버는 쿠키 없이 원본을 다시 가져오기 때문에 401 이 나고 썸네일이 통째로
 * 깨진다. `unoptimized` 로 브라우저가 직접(=세션 쿠키를 실어) 받아오게 한다.
 */
export default function PhotoGallery({
  requestId,
  photos,
  className = '',
}: {
  requestId: string;
  photos: RequestPhotoRef[];
  className?: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const count = photos.length;

  const close = useCallback(() => setOpenIndex(null), []);
  const step = useCallback(
    (delta: number) =>
      setOpenIndex((i) => (i == null ? i : (i + delta + count) % count)),
    [count],
  );

  useEffect(() => {
    if (openIndex == null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openIndex, close, step]);

  if (count === 0) return null;

  const src = (id: string) => `/api/requests/${requestId}/photos/${id}`;

  return (
    <div className={className}>
      <p className="mb-2 text-sm font-medium text-neutral-600">
        고객 첨부 사진 {count}장
      </p>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((p, i) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setOpenIndex(i)}
              className="relative block aspect-square w-full overflow-hidden rounded-xl bg-neutral-100 transition ease-brand duration-brand-base hover:opacity-90 active:scale-[0.98]"
              aria-label={`고객 첨부 사진 ${i + 1} 크게 보기`}
            >
              <Image
                src={src(p.id)}
                alt={`고객 첨부 사진 ${i + 1}`}
                fill
                unoptimized
                sizes="160px"
                className="object-cover"
              />
            </button>
          </li>
        ))}
      </ul>

      {openIndex != null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`고객 첨부 사진 ${openIndex + 1} / ${count}`}
          onClick={close}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
        >
          {/* 이미지는 화면에 맞춰 그린다. 원본 비율을 모르므로 fill 대신 고정 박스 + object-contain. */}
          <div
            className="relative h-full max-h-[80vh] w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={src(photos[openIndex].id)}
              alt={`고객 첨부 사진 ${openIndex + 1}`}
              fill
              unoptimized
              sizes="100vw"
              className="object-contain"
            />
          </div>

          <button
            type="button"
            onClick={close}
            aria-label="닫기"
            className="absolute top-4 right-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-2xl leading-none font-bold text-white hover:bg-white/25"
          >
            ×
          </button>

          {count > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  step(-1);
                }}
                aria-label="이전 사진"
                className="absolute top-1/2 left-3 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-2xl leading-none font-bold text-white hover:bg-white/25"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  step(1);
                }}
                aria-label="다음 사진"
                className="absolute top-1/2 right-3 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-2xl leading-none font-bold text-white hover:bg-white/25"
              >
                ›
              </button>
              <p className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm font-medium text-white">
                {openIndex + 1} / {count}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
