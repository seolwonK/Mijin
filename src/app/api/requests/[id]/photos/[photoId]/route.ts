import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, requireSession } from '@/lib/auth';
import { canViewRequestPhotos, readPhotoBody } from '@/lib/photos';

/**
 * 고객이 첨부한 고장 현장 사진 열람.
 *
 * 사진에는 집 내부·분전반 주변이 그대로 찍히므로 공개 URL 로 내보내지 않는다. R2 버킷은
 * 비공개로 두고 본문은 항상 이 라우트를 통해서만 나간다 — 관리자, 그리고 그 접수에 배정된
 * 업체/전기기사만 통과한다(canViewRequestPhotos).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  // 역할이 셋 중 무엇이든 허용해야 하므로 먼저 역할을 읽고, 그 역할로 승인 회수 검사를 태운다.
  const raw = await getSession();
  const session = raw ? await requireSession(raw.role) : null;
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const { id, photoId } = await params;
  // 배정되지 않은 업체·기술자는 무세션과 같은 401 로 떨군다. 앱 전체가 "권한 없음 = 401"
  // 하나로 통일돼 있고(tests/cross/auth-matrix.spec.ts 가 그 규약을 전수 단언한다),
  // 403 으로만 갈라두면 "그런 접수가 있긴 하다"는 사실이 새어 나가기도 한다.
  if (!(await canViewRequestPhotos(session, id))) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }

  const photo = await prisma.requestPhoto.findUnique({
    where: { id: photoId },
    select: { requestId: true, storageKey: true, fileId: true, mime: true },
  });
  // requestId 대조 — 권한은 접수 단위로 검사했으므로 다른 접수의 사진 id 를 끼워 넣지 못하게 한다.
  if (!photo || photo.requestId !== id) {
    return NextResponse.json({ error: '사진을 찾을 수 없습니다' }, { status: 404 });
  }

  let body: { body: Uint8Array; mime: string } | null;
  try {
    body = await readPhotoBody(photo);
  } catch (e) {
    console.error('[photos] 사진 읽기 실패', e);
    return NextResponse.json({ error: '사진을 불러오지 못했습니다' }, { status: 502 });
  }
  if (!body) {
    // 메타 행은 있는데 본문이 없는 경우 — 위의 404 와 구분되는 문구를 쓴다
    // (음성 라우트의 같은 상황과 같은 문구).
    return NextResponse.json({ error: '파일을 찾을 수 없습니다' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(body.body), {
    headers: {
      'Content-Type': body.mime,
      'Content-Length': String(body.body.byteLength),
      // 개인정보라 공유 캐시 금지. 브라우저 세션 내 재조회만 짧게 허용해 갤러리에서
      // 썸네일→원본을 오갈 때마다 R2 를 다시 때리지 않게 한다.
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
