import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db';

export const SURVEY_PAGE_SIZE = 50;
export type SurveyFilter = 'ALL' | 'SUBMITTED' | 'PENDING';
export type SurveyQuery = { status: SurveyFilter; page: number; q: string };
export type SurveyAnalyticsPrisma = {
  satisfactionSurvey: Pick<PrismaClient['satisfactionSurvey'], 'count' | 'aggregate' | 'findMany'>;
};
export type SurveyListItem = {
  surveyId: string; requestId: string; requestCode: string;
  customerName: string; customerPhone: string;
  createdAt: string; submittedAt: string | null; elapsedDays: number;
  rating: number | null; paidAmount: number | null;
  delivery?: { status: string; createdAt: string; simulated: boolean } | null;
};
export type SurveyOverview = {
  responseRate: number | null; submitted: number; total: number;
  surveys: { items: SurveyListItem[]; total: number; page: number; pageSize: number; pageCount: number; hasNext: boolean };
  paidStats: { sum: number; count: number; avg: number | null };
  updatedAt: string;
};

export async function getSurveyOverview(
  prisma: SurveyAnalyticsPrisma = defaultPrisma,
  query: SurveyQuery = { status: 'ALL', page: 1, q: '' },
): Promise<SurveyOverview> {
  const now = new Date();
  const where: Prisma.SatisfactionSurveyWhereInput = {};
  if (query.status === 'SUBMITTED') where.submittedAt = { not: null };
  if (query.status === 'PENDING') where.submittedAt = null;
  if (query.q) {
    const phone = query.q.replace(/[\s-]/g, '');
    where.request = { OR: [
      { lookupCode: { contains: query.q, mode: 'insensitive' } },
      { customerName: { contains: query.q, mode: 'insensitive' } },
      ...(/^\d+$/.test(phone) ? [{ customerPhone: { contains: phone } }] : []),
    ] };
  }
  // 상단 요약은 전체 기간, 목록만 상태·검색 조건을 적용한다.
  const [total, submitted, filteredTotal, paid] = await Promise.all([
    prisma.satisfactionSurvey.count(),
    prisma.satisfactionSurvey.count({ where: { submittedAt: { not: null } } }),
    prisma.satisfactionSurvey.count({ where }),
    prisma.satisfactionSurvey.aggregate({
      where: { submittedAt: { not: null }, paidAmount: { not: null } },
      _sum: { paidAmount: true }, _count: { paidAmount: true },
    }),
  ]);
  const pageCount = Math.max(1, Math.ceil(filteredTotal / SURVEY_PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  const surveys = await prisma.satisfactionSurvey.findMany({
    where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * SURVEY_PAGE_SIZE, take: SURVEY_PAGE_SIZE,
    select: {
      id: true, createdAt: true, submittedAt: true, rating: true, paidAmount: true,
      request: { select: { id: true, lookupCode: true, customerName: true, customerPhone: true } },
    },
  });
  const paidSum = paid._sum.paidAmount ?? 0;
  const paidCount = paid._count.paidAmount;
  return {
    responseRate: total === 0 ? null : submitted / total, submitted, total,
    surveys: {
      items: surveys.map(survey => ({
        surveyId: survey.id, requestId: survey.request.id, requestCode: survey.request.lookupCode,
        customerName: survey.request.customerName, customerPhone: survey.request.customerPhone,
        createdAt: survey.createdAt.toISOString(), submittedAt: survey.submittedAt?.toISOString() ?? null,
        elapsedDays: Math.max(0, Math.floor((now.getTime() - survey.createdAt.getTime()) / 86_400_000)),
        rating: survey.rating, paidAmount: survey.paidAmount,
      })),
      total: filteredTotal, page, pageSize: SURVEY_PAGE_SIZE, pageCount, hasNext: page < pageCount,
    },
    paidStats: { sum: paidSum, count: paidCount, avg: paidCount === 0 ? null : paidSum / paidCount },
    updatedAt: now.toISOString(),
  };
}
