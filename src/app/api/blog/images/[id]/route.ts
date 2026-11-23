import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { readStoredFile } from '@/lib/storage/files';

// 블로그 본문 이미지(공개). BlogImage 표에 등록된 파일만 내보낸다 —
// StoredFile 에는 사업자등록증·음성 같은 비공개 파일도 있어 파일 ID 로 직접 열어 주면 안 된다.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const image = await prisma.blogImage.findUnique({ where: { id }, select: { fileId: true } });
  const file = image ? await readStoredFile(image.fileId) : null;
  if (!file) {
    return NextResponse.json({ error: '이미지를 찾을 수 없습니다.' }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(file.body), {
    headers: {
      'Content-Type': file.mime,
      // 하루만 캐시한다 — 글을 지우면 사진도 지우는데, 길게 캐시하면 지운 사진이 계속 보인다.
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
