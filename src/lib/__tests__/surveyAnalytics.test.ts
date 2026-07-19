import { describe, expect, it, vi } from 'vitest';
import { getSurveyOverview, type SurveyAnalyticsPrisma } from '@/lib/surveyAnalytics';

function surveyPrismaStub(overrides: Partial<SurveyAnalyticsPrisma> = {}): SurveyAnalyticsPrisma {
  return {
    satisfactionSurvey: {
      count: vi.fn().mockResolvedValueOnce(4).mockResolvedValueOnce(2).mockResolvedValueOnce(2),
      findMany: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ _sum: { paidAmount: 9000 }, _count: { paidAmount: 3 } }),
    },
    ...overrides,
  } as unknown as SurveyAnalyticsPrisma;
}

describe('survey analytics', () => {
  it('returns a null response rate when no surveys were sent', async () => {
    const prisma = surveyPrismaStub({
      satisfactionSurvey: {
        count: vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0),
        findMany: vi.fn().mockResolvedValue([]),
        aggregate: vi.fn().mockResolvedValue({ _sum: { paidAmount: null }, _count: { paidAmount: 0 } }),
      } as unknown as SurveyAnalyticsPrisma['satisfactionSurvey'],
    });

    await expect(getSurveyOverview(prisma)).resolves.toMatchObject({
      responseRate: null,
      submitted: 0,
      total: 0,
      pending: { items: [], total: 0, hasNext: false },
      paidStats: { sum: 0, count: 0, avg: null },
    });
  });

  it('calculates response and payment averages from submitted surveys only', async () => {
    const prisma = surveyPrismaStub();
    const result = await getSurveyOverview(prisma);

    expect(result.responseRate).toBe(0.5);
    expect(result.paidStats).toEqual({ sum: 9000, count: 3, avg: 3000 });
    expect(prisma.satisfactionSurvey.aggregate).toHaveBeenCalledWith({
      where: { submittedAt: { not: null }, paidAmount: { not: null } },
      _sum: { paidAmount: true },
      _count: { paidAmount: true },
    });
  });

  it('returns pending surveys oldest first with rounded elapsed days', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T12:00:00.000Z'));
    const prisma = surveyPrismaStub({
      satisfactionSurvey: {
        count: vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1).mockResolvedValueOnce(2),
        aggregate: vi.fn().mockResolvedValue({ _sum: { paidAmount: 1000 }, _count: { paidAmount: 1 } }),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'oldest',
            createdAt: new Date('2026-07-15T06:00:00.000Z'),
            request: { lookupCode: '000001', customerName: '김고객', customerPhone: '01011112222' },
          },
          {
            id: 'recent',
            createdAt: new Date('2026-07-17T18:00:00.000Z'),
            request: { lookupCode: '000002', customerName: '이고객', customerPhone: '01033334444' },
          },
        ]),
      } as unknown as SurveyAnalyticsPrisma['satisfactionSurvey'],
    });

    const result = await getSurveyOverview(prisma);

    expect(result.pending).toEqual({
      items: [
        { surveyId: 'oldest', requestCode: '000001', customerName: '김고객', customerPhone: '01011112222', elapsedDays: 3 },
        { surveyId: 'recent', requestCode: '000002', customerName: '이고객', customerPhone: '01033334444', elapsedDays: 1 },
      ],
      total: 2,
      hasNext: false,
    });
    expect(prisma.satisfactionSurvey.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { submittedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 51,
    }));
    vi.useRealTimers();
  });

  it('limits pending surveys to the first page and reports additional surveys', async () => {
    const pendingSurveys = Array.from({ length: 51 }, (_, index) => ({
      id: `survey-${index}`,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      request: { lookupCode: `${index}`, customerName: '고객', customerPhone: '01012345678' },
    }));
    const prisma = surveyPrismaStub({
      satisfactionSurvey: {
        count: vi.fn().mockResolvedValueOnce(60).mockResolvedValueOnce(9).mockResolvedValueOnce(60),
        findMany: vi.fn().mockResolvedValue(pendingSurveys),
        aggregate: vi.fn().mockResolvedValue({ _sum: { paidAmount: null }, _count: { paidAmount: 0 } }),
      } as unknown as SurveyAnalyticsPrisma['satisfactionSurvey'],
    });

    const result = await getSurveyOverview(prisma);

    expect(result.pending.total).toBe(60);
    expect(result.pending.hasNext).toBe(true);
    expect(result.pending.items).toHaveLength(50);
    expect(result.pending.items[0]).toMatchObject({ surveyId: 'survey-0' });
  });
});
