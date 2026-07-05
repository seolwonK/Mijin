import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';

export async function GET() {
  const session = await requireSession('PROVIDER');
  if (!session?.providerId) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }

  const assignments = await prisma.assignment.findMany({
    where: { providerId: session.providerId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { request: true },
  });

  return NextResponse.json({
    jobs: assignments.map((a) => ({
      id: a.id,
      status: a.status,
      assignedBy: a.assignedBy,
      distanceKm: a.distanceKm,
      rejectReason: a.rejectReason,
      createdAt: a.createdAt,
      request: {
        id: a.request.id,
        status: a.request.status,
        urgency: a.request.urgency,
        description: a.request.description,
        address: a.request.address,
        createdAt: a.request.createdAt,
      },
    })),
  });
}
