import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { getPortalPerformanceStats, getPortalReviews } from '@/lib/portalStats';

// 받은 후기(AC-5) — partner/reviews/route.ts와 동일 계약(건 미연결·시점 무작위화·n≥5 임계).
const MIN_REVIEWS_FOR_COMMENTS = 5;

export async function GET() {
  const session = await requireSession('TECHNICIAN');
  if (!session?.technicianId) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }

  const subject = { kind: 'TECHNICIAN' as const, id: session.technicianId };
  const [stats, reviews] = await Promise.all([
    getPortalPerformanceStats(subject),
    getPortalReviews(subject),
  ]);

  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of reviews) distribution[r.rating as 1 | 2 | 3 | 4 | 5]++;

  return NextResponse.json({
    reviewCount: stats.reviewCount,
    avgRating: stats.avgRating,
    distribution,
    comments: stats.reviewCount >= MIN_REVIEWS_FOR_COMMENTS ? reviews : [],
  });
}
