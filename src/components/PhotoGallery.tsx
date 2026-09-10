'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
export type RequestPhotoRef = { id: string; mime: string };
function Photo({
  src,
  alt,
  thumbnail = false,
  onRetry,
}: {
  src: string;
  alt: string;
  thumbnail?: boolean;
  onRetry?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (failed)
    return (
      <div
        role="status"
        className={`grid h-full place-content-center gap-3 p-3 text-center text-sm ${thumbnail ? 'text-neutral-700' : 'text-white'}`}
      >
        <p>사진을 불러오지 못했습니다.</p>
        {!thumbnail && (
          <button
            onClick={() => {
              onRetry?.();
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
            className="min-h-11 rounded-lg border border-white/60 px-4"
          >
            사진 다시 시도
          </button>
        )}
      </div>
    );
  return (
    <Image
      src={`${src}?retry=${attempt}`}
      alt={alt}
      fill
      unoptimized
      sizes={thumbnail ? '160px' : '100vw'}
      onError={() => setFailed(true)}
      className={thumbnail ? 'object-cover' : 'object-contain'}
    />
  );
}
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
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const count = photos.length;
  const selectedIndex =
    openIndex == null || count === 0 ? null : Math.min(openIndex, count - 1);
  const open = selectedIndex != null;
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element?.showModal();
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      trigger.current?.focus();
    };
  }, [open]);
  if (!count) return null;
  const src = (id: string) => `/api/requests/${requestId}/photos/${id}`;
  const step = (delta: number) =>
    setOpenIndex((i) => (i == null ? i : (i + delta + count) % count));
  return (
    <div className={className}>
      <p className="mb-2 text-sm font-medium text-neutral-600">
        고객 첨부 사진 {count}장
      </p>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((photo, i) => (
          <li key={photo.id}>
            <button
              type="button"
              onClick={(e) => {
                trigger.current = e.currentTarget;
                setOpenIndex(i);
              }}
              className="relative block aspect-square w-full overflow-hidden rounded-xl bg-neutral-100"
              aria-label={`고객 첨부 사진 ${i + 1} 크게 보기`}
            >
              <Photo
                src={src(photo.id)}
                alt={`고객 첨부 사진 ${i + 1}`}
                thumbnail
              />
            </button>
          </li>
        ))}
      </ul>
      {selectedIndex != null && (
        <dialog
          ref={dialog}
          aria-label={`고객 첨부 사진 ${selectedIndex! + 1} / ${count}`}
          onCancel={() => setOpenIndex(null)}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpenIndex(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              const controls = [
                ...e.currentTarget.querySelectorAll<HTMLElement>(
                  'button:not([disabled]), a[href], [tabindex="0"]',
                ),
              ];
              const first = controls[0],
                last = controls[controls.length - 1];
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last?.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first?.focus();
              }
            }
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault();
              step(e.key === 'ArrowRight' ? 1 : -1);
            }
          }}
          className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none items-center justify-center bg-black/90 p-4 open:flex backdrop:bg-black/50"
        >
          <button
            type="button"
            autoFocus
            onClick={() => setOpenIndex(null)}
            aria-label="닫기"
            className="absolute right-4 top-4 z-10 min-h-12 min-w-12 rounded-full bg-neutral-800 text-2xl text-white"
          >
            ×
          </button>
          <div className="relative h-[75dvh] w-full max-w-4xl">
            <Photo
              key={photos[selectedIndex].id}
              onRetry={() =>
                dialog.current
                  ?.querySelector<HTMLButtonElement>('button')
                  ?.focus()
              }
              src={src(photos[selectedIndex].id)}
              alt={`고객 첨부 사진 ${selectedIndex! + 1}`}
            />
          </div>
          {count > 1 && (
            <>
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="이전 사진"
                className="absolute left-3 top-1/2 min-h-12 min-w-12 rounded-full bg-neutral-800 text-2xl text-white"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="다음 사진"
                className="absolute right-3 top-1/2 min-h-12 min-w-12 rounded-full bg-neutral-800 text-2xl text-white"
              >
                ›
              </button>
            </>
          )}
          <p role="status" className="absolute bottom-5 text-sm text-white">
            {selectedIndex + 1} / {count}
          </p>
        </dialog>
      )}
    </div>
  );
}
