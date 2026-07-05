import { NextRequest, NextResponse } from 'next/server';
import type { RequestStatus, Urgency } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const STATUSES = ['RECEIVED', 'ASSIGNED', 'ACCEPTED', 'DISPATCHED', 'COMPLETED', 'CANCELED'];
const URGENCIES = ['CRITICAL', 'URGENT', 'NORMAL'];

export async function GET(req: NextRequest) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const urgency = searchParams.get('urgency');

  const requests = await prisma.serviceRequest.findMany({
    where: {
      ...(status && STATUSES.includes(status) ? { status: status as RequestStatus } : {}),
      ...(urgency && URGENCIES.includes(urgency) ? { urgency: urgency as Urgency } : {}),
    },
    orderBy: [{ needsAttention: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    include: {
      assignments: {
        where: { status: { in: ['REQUESTED', 'ACCEPTED'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { provider: { include: { user: { select: { name: true } } } } },
      },
    },
  });

  return NextResponse.json({
    requests: requests.map((r) => ({
      id: r.id,
      lookupCode: r.lookupCode,
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      description: r.description,
      urgency: r.urgency,
      status: r.status,
      address: r.address,
      needsAttention: r.needsAttention,
      createdAt: r.createdAt,
      assignBaseAt: r.assignBaseAt,
      providerName: r.assignments[0]?.provider.user.name ?? null,
    })),
  });
}
