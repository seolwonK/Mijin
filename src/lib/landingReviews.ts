import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/db';

export type LandingReviewStats = {
  avgRating: number;
  reviewCount: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
};

const MIN_REVIEWS_TO_SHOW = 3;

async function fetchLandingReviewStats(): Promise<LandingReviewStats | null> {
  const where = { submittedAt: { not: null }, rating: { not: null } } as const;
  const [agg, groups] = await Promise.all([
    prisma.satisfactionSurvey.aggregate({ where, _avg: { rating: true }, _count: { _all: true } }),
    prisma.satisfactionSurvey.groupBy({ by: ['rating'], where, _count: { _all: true } }),
  ]);

  const reviewCount = agg._count._all;
  if (reviewCount < MIN_REVIEWS_TO_SHOW) return null; // 임계 미만 — 섹션 미노출

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
  for (const g of groups) if (g.rating != null) distribution[g.rating as 1 | 2 | 3 | 4 | 5] = g._count._all;

  return { avgRating: agg._avg.rating ?? 0, reviewCount, distribution };
}

// zero-exception: tags 없음, revalidate는 리터럴 3600(안전망). 설문 제출 라우트(api/survey/[token]/route.ts)
// 무접촉 — 새 후기는 최대 1시간 지연 후 반영(사용자 비준 완료, 신생 저볼륨 서비스에 수용 가능).
export const getLandingReviewStats = unstable_cache(fetchLandingReviewStats, ['landing-reviews'], {
  revalidate: 3600,
});
