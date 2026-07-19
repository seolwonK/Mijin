import { describe, expect, it, vi } from 'vitest';
import { getRatingSubjectDetail, getRatingsRanking, parseRatingSubject, type RatingsAnalyticsPrisma } from '@/lib/ratingsAnalytics';

function prismaStub(): RatingsAnalyticsPrisma {
  return {
    satisfactionSurvey: {
      groupBy: vi.fn().mockImplementation(({ by }: { by: string[] }) => Promise.resolve(by[0] === 'providerId'
        ? [{ providerId: 'p-b', _avg: { rating: 4 }, _count: { rating: 2 } }, { providerId: 'p-a', _avg: { rating: 4 }, _count: { rating: 2 } }]
        : [])),
      findMany: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    assignment: {
      groupBy: vi.fn().mockImplementation(({ by }: { by: string[] }) => Promise.resolve(by[0] === 'providerId'
        ? [
            // 접수 단위 dedupe 의미 — (subject, request) 그룹 행당 완료 1건 (동일 접수 ACCEPTED 이력 2행이어도 1행)
            { providerId: 'p-zero', requestId: 'r1', _count: { _all: 2 } },
            { providerId: 'p-zero', requestId: 'r2', _count: { _all: 1 } },
            { providerId: 'p-zero', requestId: 'r3', _count: { _all: 1 } },
          ]
        : [])),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([
        { name: 'B', provider: { id: 'p-b' }, technician: null },
        { name: 'A', provider: { id: 'p-a' }, technician: null },
        { name: 'Zero', provider: { id: 'p-zero' }, technician: null },
      ]),
    },
    $queryRaw: vi.fn(),
  } as unknown as RatingsAnalyticsPrisma;
}

describe('ratings analytics', () => {
  it('sorts tied ratings by subject key and places zero-review completed subjects last', async () => {
    const prisma = prismaStub();
    const result = await getRatingsRanking(prisma);
    expect(result.ranking.map((row) => row.subjectKey)).toEqual(['PROVIDER:p-a', 'PROVIDER:p-b', 'PROVIDER:p-zero']);
    expect(result.ranking[2]).toMatchObject({ avgRating: null, reviewCount: 0, completed: 3 });
    expect(prisma.satisfactionSurvey.groupBy).toHaveBeenNthCalledWith(1, {
      by: ['providerId'],
      where: { providerId: { not: null }, rating: { not: null }, submittedAt: { not: null } },
      _avg: { rating: true },
      _count: { rating: true },
    });
    expect(prisma.satisfactionSurvey.groupBy).toHaveBeenNthCalledWith(2, {
      by: ['technicianId'],
      where: { technicianId: { not: null }, rating: { not: null }, submittedAt: { not: null } },
      _avg: { rating: true },
      _count: { rating: true },
    });
    expect(prisma.assignment.groupBy).toHaveBeenNthCalledWith(1, {
      by: ['providerId', 'requestId'],
      where: { providerId: { not: null }, status: 'ACCEPTED', request: { status: 'COMPLETED' } },
      _count: { _all: true },
    });
    expect(prisma.assignment.groupBy).toHaveBeenNthCalledWith(2, {
      by: ['technicianId', 'requestId'],
      where: { technicianId: { not: null }, status: 'ACCEPTED', request: { status: 'COMPLETED' } },
      _count: { _all: true },
    });
  });

  it('passes the review cursor and returns a bounded page with the next cursor and KST monthly buckets', async () => {
    const reviews = Array.from({ length: 31 }, (_, index) => ({
      id: `survey-${index + 1}`,
      rating: 5,
      comment: `후기 ${index + 1}`,
      submittedAt: new Date(`2026-07-${String(31 - index).padStart(2, '0')}T00:00:00.000Z`),
    }));
    const prisma = prismaStub();
    (prisma.satisfactionSurvey.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(reviews);
    (prisma.satisfactionSurvey.count as ReturnType<typeof vi.fn>).mockResolvedValue(34);
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([
      { bucket: '2026-07', avgRating: '4.5', reviewCount: '31' },
    ]);

    const result = await getRatingSubjectDetail('PROVIDER', 'p-a', 'survey-before-page', prisma);

    expect(prisma.satisfactionSurvey.findMany).toHaveBeenCalledWith({
      where: { providerId: 'p-a', submittedAt: { not: null }, rating: { not: null } },
      select: { id: true, rating: true, comment: true, submittedAt: true },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      cursor: { id: 'survey-before-page' },
      skip: 1,
      take: 31,
    });
    expect(prisma.satisfactionSurvey.count).toHaveBeenCalledWith({
      where: { providerId: 'p-a', submittedAt: { not: null }, rating: { not: null } },
    });
    expect(result).toMatchObject({
      monthly: [{ bucket: '2026-07', avgRating: 4.5, reviewCount: 31 }],
      reviews: { total: 34, hasNext: true, nextCursor: 'survey-30' },
    });
    expect(result.reviews.items).toHaveLength(30);
    expect(result.reviews.items[0]?.comment).toBe('후기 1');

    const querySql = (
      prisma.$queryRaw as unknown as { mock: { calls: Array<[{ strings: readonly string[] }]> } }
    ).mock.calls[0]?.[0].strings.join('');
    expect(querySql).toContain('(("submittedAt" AT TIME ZONE \'UTC\') AT TIME ZONE \'Asia/Seoul\')');
  });
  it('accepts only a prefixed, non-empty subject key', () => {
    expect(parseRatingSubject('PROVIDER:abc')).toEqual({ kind: 'PROVIDER', id: 'abc' });
    expect(parseRatingSubject('TECHNICIAN:abc')).toEqual({ kind: 'TECHNICIAN', id: 'abc' });
    expect(parseRatingSubject('PROVIDER:')).toBeNull();
    expect(parseRatingSubject('USER:abc')).toBeNull();
    expect(parseRatingSubject('PROVIDER:a:b')).toBeNull();
  });
});
