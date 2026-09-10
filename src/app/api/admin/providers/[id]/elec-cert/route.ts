import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { readStoredFile } from '@/lib/storage/files';

// 전기공사업 등록증 열람 — 개인정보 포함 파일이므로 관리자 전용.
// R2 또는 기존 DB 저장분을 읽는다.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const { id } = await params;
  const provider = await prisma.provider.findUnique({
    where: { id },
    select: { elecCertFileId: true },
  });
  if (!provider?.elecCertFileId) {
    return NextResponse.json({ error: '첨부된 증빙이 없습니다' }, { status: 404 });
  }

  let stored;
  try {
    stored = await readStoredFile(provider.elecCertFileId);
  } catch {
    return NextResponse.json({ error: '파일 저장소에 연결할 수 없습니다' }, { status: 502 });
  }
  if (!stored) {
    return NextResponse.json({ error: '파일을 찾을 수 없습니다' }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(stored.body), {
    headers: {
      'Content-Type': stored.mime,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
