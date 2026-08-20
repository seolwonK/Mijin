import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db';
import type { Session } from '@/lib/auth';
import { isR2Configured, r2Get, r2Put } from '@/lib/storage/r2';
// 한계값은 접수 화면(클라이언트)도 봐야 하므로 서버 의존성이 없는 모듈에 두고 여기서 재수출한다.
import { MAX_PHOTOS, MAX_PHOTO_BYTES, SUPPORTED_PHOTO_MIMES } from '@/lib/photoLimits';

/**
 * 접수 사진(고장 현장 사진) 도메인 규칙.
 *
 * 저장 위치는 두 갈래다 — R2 가 설정돼 있으면 R2, 아니면 DB(StoredFile). 로컬 개발과 E2E 는
 * R2 자격증명 없이 돌아가야 하므로 폴백이 필수고, 그 반대로 프로덕션에서 DB 에 이미지를
 * 쌓지 않으려면 R2 가 필요하다. 어느 쪽이든 `RequestPhoto` 한 행이 사진 하나를 가리키고,
 * 읽기는 `readPhotoBody()` 하나로 통일된다.
 */

export { MAX_PHOTOS, MAX_PHOTO_BYTES, SUPPORTED_PHOTO_MIMES };

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// Prisma 의 Bytes 는 ArrayBuffer 를 backing 으로 하는 Uint8Array 만 받는다.
export type PhotoUpload = { bytes: Uint8Array<ArrayBuffer>; mime: string };

/**
 * 매직 바이트로 실제 포맷을 확인한다. 브라우저가 붙이는 MIME 은 확장자 기반이라
 * 신뢰할 수 없고, 선언과 내용이 어긋난 파일을 저장하면 나중에 그 MIME 그대로
 * 되돌려주게 된다. 응답에 nosniff 를 달아도 원천에서 걸러두는 편이 낫다.
 */
export function sniffPhotoMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return 'image/png';
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  )
    return 'image/webp';
  return null;
}

/**
 * 거절 사유 코드. **문구가 아니라 코드로** 돌려주는 이유: 사용자에게 나가는 4xx 문구는
 * 라우트 파일 안에 분기별로 드러나 있어야 한다(tests/helpers/gates.ts 의 그림자 지도가
 * route.ts 의 4xx 반환문을 전수 대조한다). 여기서 문자열을 만들어 넘기면 라우트에는
 * 분기가 하나로 뭉쳐 보여, 어느 사유를 때렸는지 테스트가 특정할 수 없다.
 */
export type PhotoRejectReason = 'TOO_MANY' | 'TOO_LARGE' | 'UNSUPPORTED';

/**
 * multipart 폼에서 `photos` 파일들을 꺼내 검증한다.
 * 통과한 업로드 목록, 또는 첫 번째 거절 사유를 돌려준다.
 */
export async function collectPhotoUploads(
  form: FormData,
): Promise<{ photos: PhotoUpload[] } | { error: PhotoRejectReason }> {
  const files = form
    .getAll('photos')
    .filter((v): v is File => v instanceof File && v.size > 0);
  if (files.length === 0) return { photos: [] };
  if (files.length > MAX_PHOTOS) return { error: 'TOO_MANY' };

  const photos: PhotoUpload[] = [];
  for (const file of files) {
    if (file.size > MAX_PHOTO_BYTES) return { error: 'TOO_LARGE' };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sniffed = sniffPhotoMime(bytes);
    if (!sniffed || !SUPPORTED_PHOTO_MIMES.has(sniffed)) return { error: 'UNSUPPORTED' };
    // 선언된 MIME 이 아니라 실제 내용을 신뢰한다.
    photos.push({ bytes, mime: sniffed });
  }
  return { photos };
}

/**
 * 사진을 저장하고 `RequestPhoto` 행을 만든다. 저장에 실패한 사진은 건너뛰고 로그만 남긴다 —
 * 접수 자체(고객이 사람을 부르는 일)가 사진보다 우선이라, 사진 때문에 접수를 실패시키지 않는다.
 *
 * @returns 실제로 저장된 사진 수
 */
export async function saveRequestPhotos(
  requestId: string,
  uploads: PhotoUpload[],
): Promise<number> {
  if (uploads.length === 0) return 0;
  const useR2 = isR2Configured();

  const results = await Promise.all(
    uploads.map(async (upload, index) => {
      let storageKey: string | null = null;
      let fileId: string | null = null;

      if (useR2) {
        const key = `requests/${requestId}/${randomUUID()}.${EXT_BY_MIME[upload.mime]}`;
        try {
          await r2Put(key, upload.bytes, upload.mime);
          storageKey = key;
        } catch (e) {
          console.error('[photos] R2 업로드 실패 — DB 폴백', e);
        }
      }
      if (!storageKey) {
        // R2 미설정이거나 업로드가 실패한 경우. 고객이 다시 찍어올 수 없는 현장 사진이므로
        // 버리지 않고 음성 녹음과 같은 경로(DB)로 받아둔다.
        try {
          const stored = await prisma.storedFile.create({
            data: { mime: upload.mime, data: upload.bytes },
            select: { id: true },
          });
          fileId = stored.id;
        } catch (e) {
          console.error('[photos] 사진 저장 실패 — 이 사진은 생략', e);
          return null;
        }
      }

      try {
        await prisma.requestPhoto.create({
          data: {
            requestId,
            storageKey,
            fileId,
            mime: upload.mime,
            size: upload.bytes.byteLength,
            sort: index,
          },
        });
        return true;
      } catch (e) {
        console.error('[photos] 사진 메타 저장 실패 — 이 사진은 생략', e);
        return null;
      }
    }),
  );

  return results.filter(Boolean).length;
}

/** 접수에 달린 사진 메타 목록 (본문 제외). API 응답용. */
export async function listRequestPhotos(requestId: string) {
  const rows = await prisma.requestPhoto.findMany({
    where: { requestId },
    orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, mime: true, size: true },
  });
  return rows.map((p) => ({ id: p.id, mime: p.mime, size: p.size }));
}

/** 사진 본문을 저장 위치와 무관하게 읽어온다. 없으면 null. */
export async function readPhotoBody(photo: {
  storageKey: string | null;
  fileId: string | null;
  mime: string;
}): Promise<{ body: Uint8Array; mime: string } | null> {
  if (photo.storageKey) {
    const obj = await r2Get(photo.storageKey);
    return obj ? { body: obj.body, mime: photo.mime } : null;
  }
  if (photo.fileId) {
    const stored = await prisma.storedFile.findUnique({ where: { id: photo.fileId } });
    return stored ? { body: stored.data, mime: photo.mime } : null;
  }
  return null;
}

/**
 * 이 세션이 해당 접수의 사진을 볼 수 있는가.
 *
 * 관리자는 전부. 업체·전기기사는 **그 접수에 배정 이력이 있을 때만** 본다 — 배정 상세
 * 화면(api/tech/jobs/[id], api/partner/jobs/[id])이 이미 같은 기준으로 고장 내용과
 * 고객 연락처를 보여주고 있어, 사진만 다른 기준을 쓰면 규칙이 둘로 갈린다.
 * 응답 대기(REQUESTED) 상태에서도 봐야 출동 여부를 판단할 수 있으므로 배정 상태는 따지지 않는다.
 */
export async function canViewRequestPhotos(
  session: Session,
  requestId: string,
): Promise<boolean> {
  if (session.role === 'ADMIN') return true;

  if (session.role === 'TECHNICIAN' && session.technicianId) {
    const a = await prisma.assignment.findFirst({
      where: { requestId, technicianId: session.technicianId },
      select: { id: true },
    });
    return a != null;
  }
  if (session.role === 'PROVIDER' && session.providerId) {
    const a = await prisma.assignment.findFirst({
      where: { requestId, providerId: session.providerId },
      select: { id: true },
    });
    return a != null;
  }
  return false;
}
