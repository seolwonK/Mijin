import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import {
  activePortalJobs,
  afterCursor,
  decodePortalCursor,
  encodePortalCursor,
} from '@/lib/portalPagination';

export async function portalJobsResponse(
  req: NextRequest,
  role: 'PROVIDER' | 'TECHNICIAN',
) {
  const session = await requireSession(role);
  const id = role === 'PROVIDER' ? session?.providerId : session?.technicianId;
  if (!session || !id)
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  const owner = role === 'PROVIDER' ? { providerId: id } : { technicianId: id };
  const query = req.nextUrl.searchParams;
  const historyOnly = query.get('view') === 'history';
  let cursor;
  try {
    cursor = decodePortalCursor(query.get('cursor'));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  const search = (query.get('q') ?? '').trim().slice(0, 100);
  const state = query.get('status');
  const filter: Prisma.AssignmentWhereInput =
    state === 'COMPLETED'
      ? { status: 'ACCEPTED', request: { status: 'COMPLETED' } }
      : state === 'REJECTED' || state === 'EXPIRED' || state === 'CANCELED'
        ? { status: state }
        : {};
  const where: Prisma.AssignmentWhereInput = {
    AND: [
      owner,
      { NOT: activePortalJobs },
      filter,
      ...(search
        ? [
            {
              request: {
                OR: [
                  {
                    description: {
                      contains: search,
                      mode: 'insensitive' as const,
                    },
                  },
                  {
                    address: { contains: search, mode: 'insensitive' as const },
                  },
                  {
                    customerName: {
                      contains: search,
                      mode: 'insensitive' as const,
                    },
                  },
                ],
              },
            },
          ]
        : []),
    ],
  };
  // Current work is fetched separately; history pagination must never hide active jobs.
  const [active, past, totalPast] = await Promise.all([
    historyOnly
      ? Promise.resolve([])
      : prisma.assignment.findMany({
          where: { AND: [owner, activePortalJobs] },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: { request: true },
        }),
    prisma.assignment.findMany({
      where: { AND: [where, afterCursor(cursor)] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 21,
      include: { request: true },
    }),
    prisma.assignment.count({ where }),
  ]);
  const page = past.slice(0, 20);
  return NextResponse.json({
    jobs: [...active, ...page].map((a) => ({
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
        createdAt: a.request.createdAt,
        customerPhone: a.request.customerPhone,
        lat: a.request.lat,
        lng: a.request.lng,
      },
    })),
    totalPast,
    nextCursor:
      past.length > 20 ? encodePortalCursor(page[page.length - 1]) : null,
  });
}
