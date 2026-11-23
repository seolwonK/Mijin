import { prisma } from '@/lib/db';
import { deleteStoredFile, saveStoredFile } from '@/lib/storage/files';
import { BLOG_IMAGE_PATH, ownImageIds } from './sanitize';

// 블로그 본문 이미지 저장. 네이버 블로그에서 복사한 글의 이미지는 네이버 서버 주소라
// 다른 사이트에서 불러오면 막히므로, 붙여 넣는 시점에 우리 저장소로 옮긴다.

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** 파일 앞머리로 실제 형식을 판별한다(Content-Type 은 믿지 않는다). SVG 는 스크립트를 담을 수 있어 받지 않는다. */
export function sniffImageMime(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return 'image/webp';
  }
  return null;
}

/** 가져오기를 허용하는 외부 주소 — 네이버 이미지 서버만. 임의 주소를 서버가 대신 요청하지 않게 한다. */
export function isImportableImageUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  return /^([a-z0-9-]+\.)+pstatic\.net$|^blogfiles\.naver\.net$/.test(host) ? url : null;
}

/**
 * 네이버 이미지 받아 오기. 본문을 끝까지 받은 뒤 크기를 재면 큰 파일이 메모리에 그대로 쌓이므로 받으면서 센다.
 * 'too-large' | 'failed' | 바이트.
 */
export async function fetchRemoteImage(url: URL): Promise<Uint8Array<ArrayBuffer> | 'too-large' | 'failed'> {
  try {
    // 네이버 이미지 서버는 블로그에서 온 요청인지 Referer 로 확인한다.
    const res = await fetch(url, {
      headers: { Referer: 'https://blog.naver.com/', 'User-Agent': 'Mozilla/5.0' },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok || !res.body) return 'failed';
    if (Number(res.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) return 'too-large';
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel();
        return 'too-large';
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.byteLength;
    }
    return out;
  } catch {
    return 'failed';
  }
}

/**
 * 글에서 빠진 사진 정리 — 예전 본문에 있던 사진 가운데 이제 어떤 글도 쓰지 않는 것을 저장소에서 지운다.
 * 글을 지웠는데 사진 주소가 계속 열려 있으면 안 된다(실수로 올린 고객 집 사진 등).
 * 정리 실패는 저장·삭제 자체를 막지 않는다.
 */
export async function removeUnusedImages(previousHtml: string): Promise<void> {
  for (const id of ownImageIds(previousHtml)) {
    try {
      const stillUsed = await prisma.blogPost.count({ where: { contentHtml: { contains: `${BLOG_IMAGE_PATH}${id}` } } });
      if (stillUsed) continue;
      const image = await prisma.blogImage.findUnique({ where: { id }, select: { fileId: true } });
      if (!image) continue;
      await prisma.blogImage.delete({ where: { id } });
      await deleteStoredFile(image.fileId);
    } catch (e) {
      console.error('[blog] 미사용 이미지 정리 실패', id, e);
    }
  }
}

export async function saveBlogImage(bytes: Uint8Array, mime: string): Promise<string> {
  const file = await saveStoredFile('blog', mime, bytes);
  try {
    const image = await prisma.blogImage.create({ data: { fileId: file.id }, select: { id: true } });
    return `${BLOG_IMAGE_PATH}${image.id}`;
  } catch (error) {
    await deleteStoredFile(file.id).catch(() => console.error('[blog] 이미지 롤백 실패', file.id));
    throw error;
  }
}
