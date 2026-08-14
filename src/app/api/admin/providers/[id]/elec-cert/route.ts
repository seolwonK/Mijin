import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';

// 전기공사업 등록증 열람 — 개인정보 포함 파일이므로 관리자 전용.
// bizCert(cert/route.ts)와 달리 레거시 파일시스템 저장분이 없어 DB만 본다.
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

  const stored = await prisma.storedFile.findUnique({
    where: { id: provider.elecCertFileId },
  });
  if (!stored) {
    return NextResponse.json({ error: '파일을 찾을 수 없습니다' }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(stored.data), {
    headers: {
      'Content-Type': stored.mime,
      'Cache-Control': 'private, no-store',
    },
  });
}
