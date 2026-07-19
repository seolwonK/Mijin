import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db';
import { kstDateString, kstMonthRangeUtc, kstMonthString } from '@/lib/kst';

export type SettlementReportPrisma = {
  satisfactionSurvey: Pick<PrismaClient['satisfactionSurvey'], 'groupBy' | 'findMany'>;
  provider: Pick<PrismaClient['provider'], 'findMany'>;
  technician: Pick<PrismaClient['technician'], 'findMany'>;
};

export type SettlementRow = {
  payeeId: string;
  name: string;
  type: '업체' | '기술자';
  total: number;
  aggregatedCount: number;
  completedCount: number;
  missingCount: number;
  coverage: number;
};

export type SettlementReport = {
  month: string;
  providers: SettlementRow[];
  technicians: SettlementRow[];
};

export type SettlementSourceRow = {
  lookupCode: string;
  surveyId: string;
  payeeName: string;
  type: '업체' | '기술자';
  submittedAt: string;
  paidAmount: number;
};

type SettlementOptions = { month?: string | null; now?: Date };
type CompletedGroup = { providerId?: string | null; technicianId?: string | null; _count: number };
type AggregatedGroup = CompletedGroup & { _sum: { paidAmount: number | null } };

function resolvedMonth(month: string | null | undefined, now: Date): string {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? '') ? month! : kstMonthString(now);
}

async function payeeNames(prisma: SettlementReportPrisma, providerIds: string[], technicianIds: string[]) {
  const [providers, technicians] = await Promise.all([
    providerIds.length === 0
      ? []
      : prisma.provider.findMany({
          where: { id: { in: providerIds } },
          select: { id: true, user: { select: { name: true } } },
        }),
    technicianIds.length === 0
      ? []
      : prisma.technician.findMany({
          where: { id: { in: technicianIds } },
          select: { id: true, user: { select: { name: true } } },
        }),
  ]);

  return {
    providers: new Map(providers.map((provider) => [provider.id, provider.user.name ?? '-'])),
    technicians: new Map(technicians.map((technician) => [technician.id, technician.user.name ?? '-'])),
  };
}

function buildRows(
  completed: CompletedGroup[],
  aggregated: AggregatedGroup[],
  key: 'providerId' | 'technicianId',
  type: SettlementRow['type'],
  names: Map<string, string>,
): SettlementRow[] {
  const aggregatedById = new Map(
    aggregated.flatMap((group) => {
      const id = group[key];
      return id ? [[id, group] as const] : [];
    }),
  );

  return completed
    .flatMap((group) => {
      const payeeId = group[key];
      if (!payeeId) return [];
      const paid = aggregatedById.get(payeeId);
      const aggregatedCount = paid?._count ?? 0;
      if (aggregatedCount === 0) return [];
      const completedCount = group._count;
      const total = paid?._sum.paidAmount ?? 0;
      return [{
        payeeId,
        name: names.get(payeeId) ?? '-',
        type,
        total,
        aggregatedCount,
        completedCount,
        missingCount: completedCount - aggregatedCount,
        coverage: completedCount === 0 ? 0 : aggregatedCount / completedCount,
      }];
    })
    .sort((left, right) => right.total - left.total);
}

export async function getSettlementReport(
  prisma: SettlementReportPrisma = defaultPrisma,
  { month, now = new Date() }: SettlementOptions = {},
): Promise<SettlementReport> {
  const resolved = resolvedMonth(month, now);
  const submittedAt = kstMonthRangeUtc(resolved, now);
  const completedWhere = { submittedAt };
  const aggregatedWhere = { ...completedWhere, paidAmount: { not: null } };

  const [providerCompleted, providerAggregated, technicianCompleted, technicianAggregated] = await Promise.all([
    prisma.satisfactionSurvey.groupBy({ by: ['providerId'], where: completedWhere, _count: true }),
    prisma.satisfactionSurvey.groupBy({ by: ['providerId'], where: aggregatedWhere, _count: true, _sum: { paidAmount: true } }),
    prisma.satisfactionSurvey.groupBy({ by: ['technicianId'], where: completedWhere, _count: true }),
    prisma.satisfactionSurvey.groupBy({ by: ['technicianId'], where: aggregatedWhere, _count: true, _sum: { paidAmount: true } }),
  ]);

  const providerIds = [...new Set([...providerCompleted, ...providerAggregated].flatMap((group) => group.providerId ? [group.providerId] : []))];
  const technicianIds = [...new Set([...technicianCompleted, ...technicianAggregated].flatMap((group) => group.technicianId ? [group.technicianId] : []))];
  const names = await payeeNames(prisma, providerIds, technicianIds);

  return {
    month: resolved,
    providers: buildRows(providerCompleted, providerAggregated, 'providerId', '업체', names.providers),
    technicians: buildRows(technicianCompleted, technicianAggregated, 'technicianId', '기술자', names.technicians),
  };
}

export async function getSettlementSourceRows(
  prisma: SettlementReportPrisma = defaultPrisma,
  { month, now = new Date() }: SettlementOptions = {},
): Promise<SettlementSourceRow[]> {
  const resolved = resolvedMonth(month, now);
  const submittedAt = kstMonthRangeUtc(resolved, now);
  const surveys = await prisma.satisfactionSurvey.findMany({
    where: { submittedAt, paidAmount: { not: null } },
    select: {
      id: true,
      paidAmount: true,
      submittedAt: true,
      providerId: true,
      technicianId: true,
      request: { select: { lookupCode: true } },
    },
  });
  const providerIds = [...new Set(surveys.flatMap((survey) => survey.providerId ? [survey.providerId] : []))];
  const technicianIds = [...new Set(surveys.flatMap((survey) => survey.technicianId ? [survey.technicianId] : []))];
  const names = await payeeNames(prisma, providerIds, technicianIds);

  return surveys.flatMap((survey) => {
    if (survey.paidAmount === null || survey.submittedAt === null) return [];
    const isProvider = survey.providerId !== null;
    const payeeId = isProvider ? survey.providerId : survey.technicianId;
    if (!payeeId) return [];
    return [{
      lookupCode: survey.request.lookupCode,
      surveyId: survey.id,
      payeeName: (isProvider ? names.providers : names.technicians).get(payeeId) ?? '-',
      type: isProvider ? '업체' : '기술자',
      submittedAt: survey.submittedAt.toISOString(),
      paidAmount: survey.paidAmount,
    }];
  });
}

function csvCell(value: string | number): string {
  let text = String(value);
  // CSV 수식 인젝션 방어 — 수식 트리거 문자로 시작하면 작은따옴표로 무력화한다.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toSettlementCsv(rows: SettlementSourceRow[]): string {
  const header = ['조회코드', '설문ID', '대상', '유형', '제출일(KST)', '고객신고금액(원)'];
  const lines = rows.map((row) => [
    row.lookupCode,
    row.surveyId,
    row.payeeName,
    row.type,
    kstDateString(new Date(row.submittedAt)),
    row.paidAmount,
  ].map(csvCell).join(','));
  return [header.join(','), ...lines].join('\r\n');
}
