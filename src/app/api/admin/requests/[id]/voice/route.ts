import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { resolveUploadPath } from '@/lib/uploads';

// 고객 음성 녹음 재생 — 개인정보 포함이므로 관리자 전용.
// 본문은 DB(StoredFile)에서 읽고, 구버전 파일시스템 저장분은 폴백으로 지원.
// Safari 의 <audio> 는 Range 요청을 보내므로 206 부분 응답을 지원한다.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const { id } = await params;
  const request = await prisma.serviceRequest.findUnique({
    where: { id },
    select: { voiceFileId: true, voicePath: true, voiceMime: true },
  });
  if (!request || (!request.voiceFileId && !request.voicePath)) {
    return NextResponse.json({ error: '음성 녹음이 없습니다' }, { status: 404 });
  }

  let buf: Uint8Array;
  let mime = request.voiceMime ?? 'application/octet-stream';
  if (request.voiceFileId) {
    const stored = await prisma.storedFile.findUnique({
      where: { id: request.voiceFileId },
    });
    if (!stored) {
      return NextResponse.json({ error: '파일을 찾을 수 없습니다' }, { status: 404 });
    }
    buf = stored.data;
    mime = request.voiceMime ?? stored.mime;
  } else {
    // 레거시: 파일시스템 저장분 (경로 조작 방지 포함)
    const filePath = resolveUploadPath(request.voicePath!);
    if (!filePath) {
      return NextResponse.json({ error: '잘못된 경로입니다' }, { status: 400 });
    }
    try {
      buf = await fs.readFile(filePath);
    } catch {
      return NextResponse.json({ error: '파일을 읽을 수 없습니다' }, { status: 404 });
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': mime,
    'Cache-Control': 'private, no-store',
    'Accept-Ranges': 'bytes',
  };

  const range = req.headers.get('range');
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (m && (m[1] || m[2])) {
    const start = m[1] ? parseInt(m[1], 10) : Math.max(0, buf.length - parseInt(m[2], 10));
    const end = m[1] && m[2] ? Math.min(parseInt(m[2], 10), buf.length - 1) : buf.length - 1;
    if (start > end || start >= buf.length) {
      return new NextResponse(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${buf.length}` },
      });
    }
    return new NextResponse(new Uint8Array(buf.subarray(start, end + 1)), {
      status: 206,
      headers: {
        ...headers,
        'Content-Range': `bytes ${start}-${end}/${buf.length}`,
        'Content-Length': String(end - start + 1),
      },
    });
  }

  return new NextResponse(new Uint8Array(buf), {
    headers: { ...headers, 'Content-Length': String(buf.length) },
  });
}
