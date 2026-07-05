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
    select: { id: true, lat: true, lng: true },
  });
  if (!request) {
    return NextResponse.json({ error: '접수를 찾을 수 없습니다' }, { status: 404 });
  }
  const candidates = await getCandidates(request);
  return NextResponse.json({ candidates, hasCoords: request.lat != null && request.lng != null });
}
