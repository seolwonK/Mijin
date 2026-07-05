import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession('PROVIDER');
  if (!session?.providerId) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }

  const { id } = await params;
  const a = await prisma.assignment.findUnique({
    where: { id },
    include: { request: true },
  });
  if (!a || a.providerId !== session.providerId) {
    return NextResponse.json({ error: '배정 건을 찾을 수 없습니다' }, { status: 404 });
  }

  return NextResponse.json({
    id: a.id,
    status: a.status,
    assignedBy: a.assignedBy,
    distanceKm: a.distanceKm,
    rejectReason: a.rejectReason,
    respondedAt: a.respondedAt,
    createdAt: a.createdAt,
    request: {
      id: a.request.id,
      status: a.request.status,
      urgency: a.request.urgency,
      description: a.request.description,
      address: a.request.address,
      lat: a.request.lat,
      lng: a.request.lng,
      customerName: a.request.customerName,
      customerPhone: a.request.customerPhone,
      createdAt: a.request.createdAt,
    },
  });
}
