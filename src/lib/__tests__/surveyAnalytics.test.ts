import { describe, expect, it, vi } from 'vitest';
import { getSurveyOverview, type SurveyAnalyticsPrisma } from '@/lib/surveyAnalytics';

function stub(total = 4, submitted = 2, filtered = total) {
  const client = { satisfactionSurvey: {
    count: vi.fn().mockResolvedValueOnce(total).mockResolvedValueOnce(submitted).mockResolvedValueOnce(filtered),
    findMany: vi.fn().mockResolvedValue([]),
    aggregate: vi.fn().mockResolvedValue({ _sum: { paidAmount: 9000 }, _count: { paidAmount: 3 } }),
  } };
  return { mock: client.satisfactionSurvey, prisma: client as unknown as SurveyAnalyticsPrisma };
}

describe('survey analytics', () => {
  it('설문이 없으면 응답률·금액 평균은 null이고 빈 첫 페이지를 반환한다', async () => {
    const { mock, prisma } = stub(0, 0);
    mock.aggregate.mockResolvedValue({ _sum: { paidAmount: 0 }, _count: { paidAmount: 0 } });
    expect(await getSurveyOverview(prisma)).toMatchObject({ responseRate: null, total: 0, submitted: 0, surveys: { items: [], total: 0, page: 1, pageCount: 1, hasNext: false }, paidStats: { sum: 0, count: 0, avg: null } });
  });
  it('필터된 목록 수와 전체 요약을 분리하고 입력된 금액만 평균에 포함한다', async () => {
    const { prisma } = stub(8, 5, 2);
    expect(await getSurveyOverview(prisma, { status: 'SUBMITTED', page: 1, q: '고객' })).toMatchObject({ total: 8, submitted: 5, responseRate: 0.625, surveys: { total: 2 }, paidStats: { sum: 9000, count: 3, avg: 3000 } });
  });
  it('범위를 벗어난 페이지는 마지막 페이지로 보정한다', async () => {
    const { mock, prisma } = stub(101, 60);
    expect(await getSurveyOverview(prisma, { status: 'ALL', page: 999, q: '' })).toMatchObject({ surveys: { page: 3, pageCount: 3, hasNext: false } });
    expect(mock.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 100, take: 50 }));
  });
  it('0원과 미입력을 구분하고 설문 토큰을 반환하지 않는다', async () => {
    const { mock, prisma } = stub(3, 2);
    const createdAt = new Date(Date.now() - 86_400_000);
    mock.findMany.mockResolvedValue([
      { id: 'zero', createdAt, submittedAt: new Date(), rating: 5, paidAmount: 0, request: { id: 'r1', lookupCode: '001', customerName: '고객', customerPhone: '01000000000' } },
      { id: 'missing', createdAt, submittedAt: new Date(), rating: 4, paidAmount: null, request: { id: 'r2', lookupCode: '002', customerName: '고객', customerPhone: '01000000000' } },
      { id: 'pending', createdAt, submittedAt: null, rating: null, paidAmount: null, request: { id: 'r3', lookupCode: '003', customerName: '고객', customerPhone: '01000000000' } },
    ]);
    const result = await getSurveyOverview(prisma);
    expect(result.surveys.items[0]).toMatchObject({ paidAmount: 0, rating: 5, elapsedDays: 1 });
    expect(result.surveys.items[1]).toMatchObject({ paidAmount: null });
    expect(result.surveys.items[2]).toMatchObject({ submittedAt: null, paidAmount: null });
    expect(result.surveys.items.every(row => !('token' in row))).toBe(true);
  });
});
