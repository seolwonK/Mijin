import { prisma } from '@/lib/db';

export type RankingStats = {
  assigned30d: number; // 최근 30일 배정 횟수(수락+거절 합산 — 순환 배정 타이브레이크)
  avgRating: number; // 리뷰 평균 별점 (0건 = 3.0 중립값)
  reviewCount: number;
};

const DEFAULT_STATS: RankingStats = { assigned30d: 0, avgRating: 3.0, reviewCount: 0 };

// 후보 랭킹용 통계를 배치로 집계한다 — 후보 목록 크기만큼 개별 조회하지 않고
// providerId/technicianId `in` 필터로 groupBy 2종(배정 횟수 / 리뷰) × 2계열을 각 1쿼리로.
// 독립 심(seam) — 규모가 커지면 내부만 materialized 캐시로 치환해도 호출부(matching.ts)는 불변.
export async function getRankingStats(
  providerIds: string[],
  technicianIds: string[],
): Promise<Map<string, RankingStats>> {
  const stats = new Map<string, RankingStats>();
  if (providerIds.length === 0 && technicianIds.length === 0) return stats;

  const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [providerAssigned, technicianAssigned, providerReviews, technicianReviews] =
    await Promise.all([
      providerIds.length === 0
        ? []
        : prisma.assignment.groupBy({
            by: ['providerId'],
            where: {
              providerId: { in: providerIds },
              status: { in: ['ACCEPTED', 'REJECTED'] },
              respondedAt: { gte: cutoff30d },
            },
            _count: { _all: true },
          }),
      technicianIds.length === 0
        ? []
        : prisma.assignment.groupBy({
            by: ['technicianId'],
            where: {
              technicianId: { in: technicianIds },
              status: { in: ['ACCEPTED', 'REJECTED'] },
              respondedAt: { gte: cutoff30d },
            },
            _count: { _all: true },
          }),
      providerIds.length === 0
        ? []
        : prisma.satisfactionSurvey.groupBy({
            by: ['providerId'],
            where: { providerId: { in: providerIds }, rating: { not: null } },
            _avg: { rating: true },
            _count: { _all: true },
          }),
      technicianIds.length === 0
        ? []
        : prisma.satisfactionSurvey.groupBy({
            by: ['technicianId'],
            where: { technicianId: { in: technicianIds }, rating: { not: null } },
            _avg: { rating: true },
            _count: { _all: true },
          }),
    ]);

  // 기본값(0건, 3.0)을 먼저 채워 넣고, 집계 결과가 있는 키만 덮어쓴다.
  for (const id of providerIds) stats.set(`p:${id}`, { ...DEFAULT_STATS });
  for (const id of technicianIds) stats.set(`t:${id}`, { ...DEFAULT_STATS });

  for (const row of providerAssigned) {
    if (!row.providerId) continue;
    const key = `p:${row.providerId}`;
    const cur = stats.get(key) ?? { ...DEFAULT_STATS };
    stats.set(key, { ...cur, assigned30d: row._count._all });
  }
  for (const row of technicianAssigned) {
    if (!row.technicianId) continue;
    const key = `t:${row.technicianId}`;
    const cur = stats.get(key) ?? { ...DEFAULT_STATS };
    stats.set(key, { ...cur, assigned30d: row._count._all });
  }
  for (const row of providerReviews) {
    if (!row.providerId || row._count._all === 0) continue;
    const key = `p:${row.providerId}`;
    const cur = stats.get(key) ?? { ...DEFAULT_STATS };
    stats.set(key, {
      ...cur,
      avgRating: row._avg.rating ?? DEFAULT_STATS.avgRating,
      reviewCount: row._count._all,
    });
  }
  for (const row of technicianReviews) {
    if (!row.technicianId || row._count._all === 0) continue;
    const key = `t:${row.technicianId}`;
    const cur = stats.get(key) ?? { ...DEFAULT_STATS };
    stats.set(key, {
      ...cur,
      avgRating: row._avg.rating ?? DEFAULT_STATS.avgRating,
      reviewCount: row._count._all,
    });
  }

  return stats;
}
