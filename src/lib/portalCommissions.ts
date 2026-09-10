import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { refereeKey, resolveRefereeNames } from '@/lib/commissionDisplay';
import {
  afterCursor,
  decodePortalCursor,
  encodePortalCursor,
} from '@/lib/portalPagination';

export async function portalCommissionsResponse(
  req: NextRequest,
  role: 'PROVIDER' | 'TECHNICIAN',
) {
  const session = await requireSession(role);
  if (
    !session ||
    !(role === 'PROVIDER' ? session.providerId : session.technicianId)
  )
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  let cursor;
  try {
    cursor = decodePortalCursor(req.nextUrl.searchParams.get('cursor'));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  const where = { referrerUserId: session.userId };
  const [pending, paid, rows, totalCount] = await Promise.all([
    prisma.commissionEntry.aggregate({
      where: { ...where, status: 'PENDING' },
      _sum: { amount: true },
    }),
    prisma.commissionEntry.aggregate({
      where: { ...where, status: 'PAID' },
      _sum: { amount: true },
    }),
    prisma.commissionEntry.findMany({
      where: { AND: [where, afterCursor(cursor)] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 51,
    }),
    prisma.commissionEntry.count({ where }),
  ]);
  const entries = rows.slice(0, 50);
  const names = await resolveRefereeNames(entries);
  return NextResponse.json({
    pendingTotal: pending._sum.amount ?? 0,
    paidTotal: paid._sum.amount ?? 0,
    totalCount,
    nextCursor:
      rows.length > 50 ? encodePortalCursor(entries[entries.length - 1]) : null,
    entries: entries.map((e) => ({
      id: e.id,
      refereeName: names.get(refereeKey(e))?.name ?? '탈퇴 회원',
      refereeType: names.get(refereeKey(e))?.type ?? null,
      amount: e.amount,
      status: e.status,
      createdAt: e.createdAt,
    })),
  });
}
