import { describe, expect, it, vi } from 'vitest';
import { getDashboardStats, ratio, type AnalyticsPrisma } from '@/lib/analyticsStats';

function dashboardPrismaStub(overrides: Partial<AnalyticsPrisma> = {}): AnalyticsPrisma {
  return {
    serviceRequest: {
      count: vi.fn().mockResolvedValueOnce(4).mockResolvedValueOnce(2).mockResolvedValueOnce(1),
      groupBy: vi.fn().mockImplementation(({ by }: { by: string[] }) =>
        Promise.resolve(
          by[0] === 'urgency'
            ? [
                { urgency: 'CRITICAL', _count: { _all: 1 } },
                { urgency: 'NORMAL', _count: { _all: 2 } },
              ]
            : [{ status: 'RECEIVED', _count: { _all: 3 } }],
        ),
      ),
    },
    assignment: {
      groupBy: vi.fn().mockResolvedValue([
        { status: 'ACCEPTED', _count: { _all: 2 } },
        { status: 'REJECTED', _count: { _all: 1 } },
      ]),
    },
    satisfactionSurvey: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { paidAmount: 9000 }, _count: { paidAmount: 3 } }),
    },
    commissionEntry: {
      groupBy: vi.fn().mockResolvedValue([
        { status: 'PENDING', _sum: { amount: 500 } },
        { status: 'PAID', _sum: { amount: 700 } },
      ]),
    },
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce([{ mean: 10, median: 8, p90: 20 }])
      .mockResolvedValueOnce([{ mean: 30, median: 25, p90: 45 }])
      .mockResolvedValueOnce([
        { bucket: '2026-07-17', received: 3, completed: 1 },
        { bucket: '2026-07-18', received: 0, completed: 0 },
        { bucket: '2026-07-19', received: 1, completed: 2 },
      ]),
    ...overrides,
  } as unknown as AnalyticsPrisma;
}

describe('analytics calculations', () => {
  it('returns null for an undefined rate', () => {
    expect(ratio(0, 0)).toBeNull();
    expect(ratio(3, 4)).toBe(0.75);
  });

  it('builds acceptance, request-success, and paid-survey averages from injected Prisma results', async () => {
    const prisma = dashboardPrismaStub();
    const result = await getDashboardStats('day', prisma);

    expect(result.performance.op.offerAcceptRate).toBe(2 / 3);
    expect(result.performance.cust.requestSuccessRate).toBe(0.5);
    expect(result.money.surveyPaid).toEqual({ sum: 9000, count: 3, avg: 3000 });
    expect(result.money.commission).toEqual({ PENDING: 500, PAID: 700 });
    expect(result.operational).toEqual({
      byStatus: { RECEIVED: 3 },
      needsAttention: 1,
      byUrgencyOpen: { CRITICAL: 1, URGENT: 0, NORMAL: 2 },
    });
    expect(result.trend).toEqual([
      { bucket: '2026-07-17', received: 3, completed: 1 },
      { bucket: '2026-07-18', received: 0, completed: 0 },
      { bucket: '2026-07-19', received: 1, completed: 2 },
    ]);

    const queryCalls = (
      prisma.$queryRaw as unknown as { mock: { calls: Array<[{ strings: readonly string[] }]> } }
    ).mock.calls;
    const querySql = queryCalls.map(([sql]) => sql.strings.join('')).join('\n');
    expect(querySql).not.toContain('assignBaseAt');
    expect(querySql).toContain('percentile_cont');
    expect(querySql).toContain('AT TIME ZONE');
    expect(querySql).toContain('generate_series');

    // The fixture has two ACCEPTED assignment rows for one request; SQL selects one final response.
    const customerAcceptSql = queryCalls[1][0].strings.join('');
    expect(customerAcceptSql).toContain('DISTINCT ON (assignment."requestId")');
    expect(customerAcceptSql).toContain('ORDER BY assignment."requestId", assignment."respondedAt" DESC, assignment.id DESC');

    const surveyArgs = (
      prisma.satisfactionSurvey.aggregate as unknown as {
        mock: {
          calls: Array<
            [
              {
                where: {
                  submittedAt: { gte: Date; lt: Date; not: null };
                  paidAmount: { not: null };
                };
              },
            ]
          >;
        };
      }
    ).mock.calls[0][0];
    expect(surveyArgs.where.submittedAt).toMatchObject({
      gte: expect.any(Date),
      lt: expect.any(Date),
      not: null,
    });
    expect(surveyArgs.where.submittedAt.gte.getTime()).toBeLessThan(
      surveyArgs.where.submittedAt.lt.getTime(),
    );
    expect(surveyArgs.where.paidAmount).toEqual({ not: null });

    const commissionArgs = (
      prisma.commissionEntry.groupBy as unknown as {
        mock: {
          calls: Array<[{ by: string[]; where: { createdAt: { gte: Date; lt: Date } } }]>;
        };
      }
    ).mock.calls[0][0];
    expect(commissionArgs.by).toEqual(['status']);
    expect(commissionArgs.where.createdAt).toMatchObject({
      gte: expect.any(Date),
      lt: expect.any(Date),
    });
    expect(commissionArgs.where.createdAt.gte.getTime()).toBeLessThan(
      commissionArgs.where.createdAt.lt.getTime(),
    );
  });

  it('preserves null aggregate percentiles and returns null paid averages for no submitted payments', async () => {
    const result = await getDashboardStats(
      'week',
      dashboardPrismaStub({
        assignment: { groupBy: vi.fn().mockResolvedValue([]) } as AnalyticsPrisma['assignment'],
        satisfactionSurvey: {
          aggregate: vi.fn().mockResolvedValue({ _sum: { paidAmount: null }, _count: { paidAmount: 0 } }),
        } as AnalyticsPrisma['satisfactionSurvey'],
        $queryRaw: vi
          .fn()
          .mockResolvedValueOnce([{ mean: null, median: null, p90: null }])
          .mockResolvedValueOnce([{ mean: null, median: null, p90: null }])
          .mockResolvedValueOnce([]),
      }),
    );

    expect(result.performance.op).toMatchObject({ accepted: 0, rejected: 0, offerAcceptRate: null });
    expect(result.performance.cust.acceptSec).toEqual({ mean: null, median: null, p90: null });
    expect(result.money.surveyPaid).toEqual({ sum: 0, count: 0, avg: null });
  });
});
