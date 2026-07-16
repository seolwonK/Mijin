import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { getCandidates } from '@/lib/matching';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const { id } = await params;
  const request = await prisma.serviceRequest.findUnique({
    where: { id },
    select: { id: true, lat: true, lng: true, address: true, urgency: true },
  });
  if (!request) {
    return NextResponse.json({ error: '접수를 찾을 수 없습니다' }, { status: 404 });
  }
  // CRITICAL 접수에서도 관리자 화면에 표시할 통계(30일 배정(수락+거절)·평균 별점)를 채운다.
  const candidates = await getCandidates(request, { withStats: true });
  return NextResponse.json({ candidates, hasCoords: request.lat != null && request.lng != null });
}
