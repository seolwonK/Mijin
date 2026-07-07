import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { resolveUploadPath } from '@/lib/uploads';

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.pdf': 'application/pdf',
};

// 사업자등록증 열람 — 개인정보 포함 파일이므로 관리자 전용.
// 본문은 DB(StoredFile)에서 읽고, 구버전 파일시스템 저장분은 폴백으로 지원.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const { id } = await params;
  const provider = await prisma.provider.findUnique({
    where: { id },
    select: { bizCertFileId: true, bizCertPath: true },
  });
  if (!provider || (!provider.bizCertFileId && !provider.bizCertPath)) {
    return NextResponse.json({ error: '첨부된 증빙이 없습니다' }, { status: 404 });
  }

  if (provider.bizCertFileId) {
    const stored = await prisma.storedFile.findUnique({
      where: { id: provider.bizCertFileId },
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

  // 레거시: 파일시스템 저장분 (경로 조작 방지 포함)
  const filePath = resolveUploadPath(provider.bizCertPath!);
  if (!filePath) {
    return NextResponse.json({ error: '잘못된 경로입니다' }, { status: 400 });
  }
  try {
    const buf = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: '파일을 읽을 수 없습니다' }, { status: 404 });
  }
}
