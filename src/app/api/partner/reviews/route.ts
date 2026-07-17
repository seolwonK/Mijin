import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { getPortalPerformanceStats, getPortalReviews } from '@/lib/portalStats';

// 받은 후기(AC-5) — 건 미연결·시점 무작위화 계약은 portalStats.getPortalReviews가 보장한다
// (requestId·submittedAt·고객 필드는 애초에 select되지 않는다). 코멘트 개별 노출은
// n≥5(제출 후기 5건 이상)부터만 — 소량 후기의 역추적 리스크 완화(rev.3 게이트 비준 항목,
// n<5는 avgRating/distribution 등 집계만 응답).
const MIN_REVIEWS_FOR_COMMENTS = 5;

export async function GET() {
  const session = await requireSession('PROVIDER');
  if (!session?.providerId) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }

  const subject = { kind: 'PROVIDER' as const, id: session.providerId };
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
