import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const { id } = await params;
  const request = await prisma.serviceRequest.findUnique({
    where: { id },
    include: {
      assignments: {
        orderBy: { createdAt: 'desc' },
        include: {
          provider: { include: { user: { select: { name: true, phone: true } } } },
        },
      },
    },
  });
  if (!request) {
    return NextResponse.json({ error: '접수를 찾을 수 없습니다' }, { status: 404 });
  }

  return NextResponse.json({
    id: request.id,
    lookupCode: request.lookupCode,
    customerName: request.customerName,
    customerPhone: request.customerPhone,
    description: request.description,
    urgency: request.urgency,
    status: request.status,
    lat: request.lat,
    lng: request.lng,
    address: request.address,
    needsAttention: request.needsAttention,
    assignBaseAt: request.assignBaseAt,
    createdAt: request.createdAt,
    completedAt: request.completedAt,
    assignments: request.assignments.map((a) => ({
      id: a.id,
      status: a.status,
      assignedBy: a.assignedBy,
      distanceKm: a.distanceKm,
      rejectReason: a.rejectReason,
      respondedAt: a.respondedAt,
      createdAt: a.createdAt,
      provider: { name: a.provider.user.name, phone: a.provider.user.phone },
    })),
  });
}
