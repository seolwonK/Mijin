import { prisma } from '@/lib/db';
import { kstMonthRangeUtc } from '@/lib/kst';

export async function getSettlementDetail({ month, kind, payeeId, page }: {
  month: string; kind: 'PROVIDER' | 'TECHNICIAN'; payeeId: string; page: number;
}) {
  const payee = kind === 'PROVIDER'
    ? await prisma.provider.findUnique({ where: { id: payeeId }, select: { user: { select: { name: true } } } })
    : await prisma.technician.findUnique({ where: { id: payeeId }, select: { user: { select: { name: true } } } });
  if (!payee) return null;
  const where = {
    submittedAt: kstMonthRangeUtc(month),
    ...(kind === 'PROVIDER' ? { providerId: payeeId } : { technicianId: payeeId }),
  };
  const total = await prisma.satisfactionSurvey.count({ where });
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const resolvedPage = Math.min(page, pageCount);
  const [amounts, surveys] = await Promise.all([
    prisma.satisfactionSurvey.aggregate({ where, _sum: { paidAmount: true }, _count: { paidAmount: true } }),
    prisma.satisfactionSurvey.findMany({
      where, orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }], skip: (resolvedPage - 1) * pageSize, take: pageSize,
      select: {
        id: true, submittedAt: true, paidAmount: true, rating: true,
        request: { select: { id: true, lookupCode: true, address: true, customerName: true, description: true } },
      },
    }),
  ]);
  return {
    month, kind, payeeId, name: payee.user.name ?? '이름 없음',
    totalAmount: amounts._sum.paidAmount ?? 0, aggregatedCount: amounts._count.paidAmount,
    missingCount: total - amounts._count.paidAmount,
    total, page: resolvedPage, pageSize, pageCount, hasNext: resolvedPage < pageCount,
    items: surveys.map(survey => ({
      surveyId: survey.id, requestId: survey.request.id, requestCode: survey.request.lookupCode,
      address: survey.request.address, customerName: survey.request.customerName, description: survey.request.description,
      submittedAt: survey.submittedAt!.toISOString(), paidAmount: survey.paidAmount, rating: survey.rating,
    })),
  };
}

export type SettlementDetail = NonNullable<Awaited<ReturnType<typeof getSettlementDetail>>>;
