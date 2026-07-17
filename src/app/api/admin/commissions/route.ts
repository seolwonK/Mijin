import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { refereeKey, resolveRefereeNames } from '@/lib/commissionDisplay';

const DETAIL_PAGE_SIZE = 100;

// 인자 없음 → 소개자별 미지급/지급 요약(groupBy로 조인 없이 집계 후, 관여한 소개자만 배치 조회).
// ?referrerUserId= → 해당 소개자의 건별 내역(최근 순, cursor 기반 페이지네이션).
export async function GET(req: NextRequest) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const referrerUserId = searchParams.get('referrerUserId');

  if (referrerUserId) {
    const cursor = searchParams.get('cursor');
    // ?month=YYYY-MM → 해당 월(서버 로컬 TZ) 적립분만 조회. 정산 업무 단위(월별)와 CSV
    // 내보내기의 범위 필터로 쓰인다. 형식이 어긋나면 조용히 무시(전체 조회).
    const month = searchParams.get('month');
    let createdAt: { gte: Date; lt: Date } | undefined;
    if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      const [y, m] = month.split('-').map(Number);
      createdAt = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
    }
    const entries = await prisma.commissionEntry.findMany({
      where: { referrerUserId, ...(createdAt ? { createdAt } : {}) },
      orderBy: { createdAt: 'desc' },
      take: DETAIL_PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { survey: { select: { rating: true, comment: true } } },
    });
    const hasMore = entries.length > DETAIL_PAGE_SIZE;
    const page = hasMore ? entries.slice(0, DETAIL_PAGE_SIZE) : entries;
    const refereeMap = await resolveRefereeNames(page);

    return NextResponse.json({
      entries: page.map((e) => {
        const info = refereeMap.get(refereeKey(e));
        return {
          id: e.id,
          refereeName: info?.name ?? '-',
          refereeType: info?.type ?? null,
          requestId: e.requestId,
          baseAmount: e.baseAmount,
          amount: e.amount,
          status: e.status,
          createdAt: e.createdAt,
          paidAt: e.paidAt,
          rating: e.survey.rating,
          // 지급 전 검토 게이트용 후기 요약 — 전문 노출은 불필요(목록 밀도 우선).
          commentPreview: e.survey.comment ? e.survey.comment.slice(0, 60) : null,
          isHighAmount: e.baseAmount >= 1_000_000,
        };
      }),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  }

  const [pendingGroups, paidGroups] = await Promise.all([
    prisma.commissionEntry.groupBy({
      by: ['referrerUserId'],
      where: { status: 'PENDING' },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.commissionEntry.groupBy({
      by: ['referrerUserId'],
      where: { status: 'PAID' },
      _sum: { amount: true },
    }),
  ]);

  const referrerIds = [
    ...new Set([
      ...pendingGroups.map((g) => g.referrerUserId),
      ...paidGroups.map((g) => g.referrerUserId),
    ]),
  ];
  if (referrerIds.length === 0) return NextResponse.json({ referrers: [] });

  const pendingByUser = new Map(pendingGroups.map((g) => [g.referrerUserId, g]));
  const paidByUser = new Map(paidGroups.map((g) => [g.referrerUserId, g]));

  // 요약은 groupBy 결과에 관여한 소개자만 단일 조회 — 전체 회원을 조인하지 않는다.
  const users = await prisma.user.findMany({
    where: { id: { in: referrerIds } },
    select: {
      id: true,
      name: true,
      phone: true,
      provider: { select: { isActive: true, approvalStatus: true } },
      technician: { select: { isActive: true, approvalStatus: true } },
    },
  });

  const referrers = users
    .map((u) => {
      const account = u.provider ?? u.technician;
      const pending = pendingByUser.get(u.id);
      const paid = paidByUser.get(u.id);
      return {
        userId: u.id,
        name: u.name,
        phone: u.phone,
        type: u.provider ? ('업체' as const) : ('기술자' as const),
        isActive: account?.isActive ?? false,
        approvalStatus: account?.approvalStatus ?? null,
        pendingTotal: pending?._sum.amount ?? 0,
        pendingCount: pending?._count._all ?? 0,
        paidTotal: paid?._sum.amount ?? 0,
      };
    })
    .sort((a, b) => b.pendingTotal - a.pendingTotal);

  return NextResponse.json({ referrers });
}
