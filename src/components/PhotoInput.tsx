'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import { CameraIcon, ImageIcon } from '@/components/icons';
// 장수 상한은 서버 검증과 같은 값을 써야 한다 — 서버 의존성 없는 모듈에서 가져온다
// (@/lib/photos 는 prisma 를 import 하므로 클라이언트 번들로 끌어오면 안 된다).
import { MAX_PHOTOS } from '@/lib/photoLimits';

export type PhotoDraft = { key: string; file: File; previewUrl: string };

// 업로드 전 리사이즈 기준. 1600px 이면 관리자 화면에서 분전반 라벨·차단기 글씨를 읽기에
// 충분하면서, 요즘 폰 원본(4000px, 4~8MB)의 1/10 안쪽으로 줄어든다. 현장에서 LTE 로
// 올리는 상황을 전제하므로 화질보다 전송 성공률을 우선한다.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;
const MAX_SOURCE_BYTES = 30 * 1024 * 1024;

/**
 * 원본을 캔버스로 다시 그려 JPEG 으로 인코딩한다.
 *
 * 크기가 이미 작아도 항상 재인코딩한다 — EXIF 회전 정보를 픽셀에 반영해 "옆으로 누운 사진"을
 * 없애고, 동시에 원본에 박힌 GPS 좌표 같은 EXIF 를 통째로 털어내기 위해서다. 고객은 사진에
 * 위치가 들어 있다는 것을 대개 모르고, 이 사진은 업체·기술자에게 그대로 전달된다.
 */
async function toUploadableJpeg(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // 구형 사파리는 옵션 인자를 못 받는다. EXIF 회전은 이 경로에서 브라우저 기본 동작에 맡긴다.
    bitmap = await createImageBitmap(file);
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('canvas 2d context 없음');
  }
  // 투명 PNG 를 JPEG 으로 바꾸면 투명부가 검게 나온다 — 흰 바탕을 먼저 깔아준다.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  if (!blob) throw new Error('이미지 인코딩 실패');

  const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
}

/**
 * 접수 화면의 사진 첨부. 선택 항목이며, 첨부된 사진은 관리자와 배정된 업체/기술자만 본다.
 *
 * 촬영과 앨범을 버튼 두 개로 분리한 이유: 하나의 input 에 capture 를 걸면 기기에 따라
 * 앨범 선택이 아예 막히고, 걸지 않으면 카메라까지 두세 단계를 더 거쳐야 한다. 주 사용자층이
 * 중장년이라 "지금 찍기"와 "찍어둔 것"을 한 번에 고르게 두는 편이 오작동이 적다.
 */
export default function PhotoInput({
  photos,
  onChange,
  disabled = false,
}: {
  photos: PhotoDraft[];
  onChange: (next: PhotoDraft[]) => void;
  disabled?: boolean;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const hintId = useId();

  // 언마운트 시 남은 objectURL 정리 (개별 삭제는 remove() 에서 즉시 해제).
  // 정리 함수가 최신 목록을 봐야 하므로 ref 로 따라가되, 갱신은 렌더 밖(effect)에서 한다.
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(
    () => () => {
      for (const p of photosRef.current) URL.revokeObjectURL(p.previewUrl);
    },
    [],
  );

  async function add(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setNotice(null);
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setNotice(`사진은 최대 ${MAX_PHOTOS}장까지 첨부할 수 있어요`);
      return;
    }

    const picked = Array.from(fileList).slice(0, room);
    const skipped = fileList.length - picked.length;
    setBusy(true);
    try {
      const added: PhotoDraft[] = [];
      let failed = 0;
      for (const file of picked) {
        if (file.size > MAX_SOURCE_BYTES) {
          failed++;
          continue;
        }
        try {
          const jpeg = await toUploadableJpeg(file);
          added.push({
            key: `${Date.now()}-${added.length}-${Math.random().toString(36).slice(2, 8)}`,
            file: jpeg,
            previewUrl: URL.createObjectURL(jpeg),
          });
        } catch {
          failed++;
        }
      }
      if (added.length > 0) onChange([...photos, ...added]);
      if (failed > 0)
        setNotice(
          failed === picked.length
            ? '사진을 불러오지 못했어요. 다른 사진으로 다시 시도해 주세요.'
            : `${failed}장은 불러오지 못해 제외했어요`,
        );
      else if (skipped > 0) setNotice(`${MAX_PHOTOS}장까지만 첨부돼요`);
    } finally {
      setBusy(false);
    }
  }

  function remove(key: string) {
    const target = photos.find((p) => p.key === key);
    if (target) URL.revokeObjectURL(target.previewUrl);
    onChange(photos.filter((p) => p.key !== key));
    setNotice(null);
  }

  const full = photos.length >= MAX_PHOTOS;

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-base font-bold text-fg">사진 첨부</h3>
        <span className="text-sm text-muted">선택</span>
      </div>
      <p id={hintId} className="mt-1 text-sm text-neutral-600">
        고장 난 곳을 찍어 주시면 기사님이 미리 보고 준비해서 옵니다. (최대 {MAX_PHOTOS}장)
      </p>

      {photos.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((p, i) => (
            <li key={p.key} className="relative">
              <div className="relative aspect-square overflow-hidden rounded-xl bg-neutral-100">
                <Image
                  src={p.previewUrl}
                  alt={`첨부한 사진 ${i + 1}`}
                  fill
                  unoptimized
                  sizes="120px"
                  className="object-cover"
                />
              </div>
              <button
                type="button"
                onClick={() => remove(p.key)}
                disabled={disabled}
                aria-label={`첨부한 사진 ${i + 1} 삭제`}
                className="absolute -top-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900/80 text-lg leading-none font-bold text-white shadow-sm transition ease-brand duration-brand-base hover:bg-neutral-900 disabled:opacity-50"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={disabled || busy || full}
          aria-describedby={hintId}
          className="inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-white px-4 text-base font-bold text-fg transition ease-brand duration-brand-base enabled:hover:bg-neutral-50 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CameraIcon className="h-5 w-5" />
          사진 촬영
        </button>
        <button
          type="button"
          onClick={() => albumRef.current?.click()}
          disabled={disabled || busy || full}
          aria-describedby={hintId}
          className="inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-white px-4 text-base font-bold text-fg transition ease-brand duration-brand-base enabled:hover:bg-neutral-50 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ImageIcon className="h-5 w-5" />
          앨범에서 선택
        </button>
      </div>

      {(busy || notice) && (
        <p
          role="status"
          className={`mt-2 text-sm ${notice ? 'text-red-600' : 'text-muted'}`}
        >
          {busy ? '사진을 준비하는 중…' : notice}
        </p>
      )}

      {/* 파일 입력은 화면에서 감추고 위 버튼으로만 연다. 같은 사진을 지웠다가 다시 고를 수
          있도록 선택 후 value 를 비운다. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void add(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={albumRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void add(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
