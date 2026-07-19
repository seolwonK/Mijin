import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db';
const PENDING_PAGE_SIZE = 50;

export type SurveyAnalyticsPrisma = {
  satisfactionSurvey: Pick<
    PrismaClient['satisfactionSurvey'],
    'count' | 'aggregate' | 'findMany'
  >;
};

export type SurveyOverview = {
  responseRate: number | null;
  submitted: number;
  total: number;
  pending: {
    items: Array<{
      surveyId: string;
      requestCode: string;
      customerName: string;
      customerPhone: string;
      elapsedDays: number;
    }>;
    total: number;
    hasNext: boolean;
  };
  paidStats: { sum: number; count: number; avg: number | null };
  updatedAt: string;
};

export async function getSurveyOverview(
  prisma: SurveyAnalyticsPrisma = defaultPrisma,
): Promise<SurveyOverview> {
  const now = new Date();
  const [total, submitted, pendingTotal, pendingSurveys, paid] = await Promise.all([
    prisma.satisfactionSurvey.count(),
    prisma.satisfactionSurvey.count({ where: { submittedAt: { not: null } } }),
    prisma.satisfactionSurvey.count({ where: { submittedAt: null } }),
    prisma.satisfactionSurvey.findMany({
      where: { submittedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: PENDING_PAGE_SIZE + 1,
      select: {
        id: true,
        createdAt: true,
        request: {
          select: {
            lookupCode: true,
            customerName: true,
            customerPhone: true,
          },
        },
      },
    }),
    prisma.satisfactionSurvey.aggregate({
      where: { submittedAt: { not: null }, paidAmount: { not: null } },
      _sum: { paidAmount: true },
      _count: { paidAmount: true },
    }),
  ]);
  const paidSum = paid._sum.paidAmount ?? 0;
  const paidCount = paid._count.paidAmount;

  return {
    responseRate: total === 0 ? null : submitted / total,
    submitted,
    total,
    pending: {
      items: pendingSurveys.slice(0, PENDING_PAGE_SIZE).map((survey) => ({
        surveyId: survey.id,
        requestCode: survey.request.lookupCode,
        customerName: survey.request.customerName,
        customerPhone: survey.request.customerPhone,
        elapsedDays: Math.round((now.getTime() - survey.createdAt.getTime()) / 86_400_000),
      })),
      total: pendingTotal,
      hasNext: pendingSurveys.length > PENDING_PAGE_SIZE,
    },
    paidStats: { sum: paidSum, count: paidCount, avg: paidCount === 0 ? null : paidSum / paidCount },
    updatedAt: now.toISOString(),
  };
}
