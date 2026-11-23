import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { isCrossSiteRequest } from '@/lib/requestOrigin';
import { MAX_IMAGE_BYTES, fetchRemoteImage, isImportableImageUrl, saveBlogImage, sniffImageMime } from '@/lib/blog/images';

// 블로그 본문 이미지 올리기. 두 가지 입력을 받는다.
//  · multipart/form-data 의 file — 편집기에서 고르거나 붙여 넣은 이미지
//  · JSON { url } — 네이버 블로그에서 복사한 글에 들어 있던 네이버 이미지 주소(서버가 받아 와 저장)
export async function POST(req: NextRequest) {
  if (!(await requireSession('ADMIN'))) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }
  if (isCrossSiteRequest(req)) {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 403 });
  }

  let bytes: Uint8Array<ArrayBuffer>;
  if ((req.headers.get('content-type') ?? '').includes('application/json')) {
    const body = (await req.json().catch(() => null)) as { url?: unknown } | null;
    const url = typeof body?.url === 'string' ? isImportableImageUrl(body.url) : null;
    if (!url) {
      return NextResponse.json({ error: '네이버 이미지 주소만 가져올 수 있습니다.' }, { status: 400 });
    }
    const fetched = await fetchRemoteImage(url);
    if (fetched === 'failed') {
      return NextResponse.json({ error: '이미지를 가져오지 못했습니다. 파일로 직접 올려 주세요.' }, { status: 422 });
    }
    if (fetched === 'too-large') {
      return NextResponse.json({ error: '이미지가 너무 큽니다 (최대 10MB).' }, { status: 413 });
    }
    bytes = fetched;
  } else {
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '이미지 파일을 선택해 주세요.' }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: '이미지가 너무 큽니다 (최대 10MB).' }, { status: 413 });
    }
    bytes = new Uint8Array(await file.arrayBuffer());
  }

  const mime = sniffImageMime(bytes);
  if (!mime) {
    return NextResponse.json({ error: 'JPG·PNG·GIF·WEBP 이미지만 올릴 수 있습니다.' }, { status: 415 });
  }
  return NextResponse.json({ url: await saveBlogImage(bytes, mime) }, { status: 201 });
}
