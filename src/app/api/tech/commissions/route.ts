import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { refereeKey, resolveRefereeNames } from '@/lib/commissionDisplay';

// 본인(소개자) 조회 — referrerUserId는 소개자의 User.id이므로 세션 userId와 그대로 대응.
export async function GET() {
  const session = await requireSession('TECHNICIAN');
  if (!session?.technicianId) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }

  const [pendingAgg, paidAgg, entries] = await Promise.all([
    prisma.commissionEntry.aggregate({
      where: { referrerUserId: session.userId, status: 'PENDING' },
      _sum: { amount: true },
    }),
    prisma.commissionEntry.aggregate({
      where: { referrerUserId: session.userId, status: 'PAID' },
      _sum: { amount: true },
    }),
    prisma.commissionEntry.findMany({
      where: { referrerUserId: session.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  const refereeMap = await resolveRefereeNames(entries);

  return NextResponse.json({
    pendingTotal: pendingAgg._sum.amount ?? 0,
    paidTotal: paidAgg._sum.amount ?? 0,
    entries: entries.map((e) => {
      const info = refereeMap.get(refereeKey(e));
      return {
        id: e.id,
        refereeName: info?.name ?? '-',
        refereeType: info?.type ?? null,
        amount: e.amount,
        status: e.status,
        createdAt: e.createdAt,
      };
    }),
  });
}
