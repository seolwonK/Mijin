import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db';
import { kstRangeUtc, type AnalyticsPeriod } from '@/lib/kst';

type CountRow = { status: string; _count: { _all: number } };
type AmountRow = { status: string; _sum: { amount: number | null } };
type PercentileRow = { mean: number | null; median: number | null; p90: number | null };
type TrendRow = { bucket: string; received: number | string; completed: number | string };

export type AnalyticsPrisma = Pick<PrismaClient, '$queryRaw'> & {
  serviceRequest: Pick<PrismaClient['serviceRequest'], 'count' | 'groupBy'>;
  assignment: Pick<PrismaClient['assignment'], 'groupBy'>;
  satisfactionSurvey: Pick<PrismaClient['satisfactionSurvey'], 'aggregate'>;
  commissionEntry: Pick<PrismaClient['commissionEntry'], 'groupBy'>;
};

export type DashboardStats = {
  operational: {
    byStatus: Record<string, number>;
    needsAttention: number;
    byUrgencyOpen: Record<'CRITICAL' | 'URGENT' | 'NORMAL', number>;
  };
  trend: Array<{ bucket: string; received: number; completed: number }>;
  performance: {
    op: {
      firstOfferSec: PercentileRow;
      offerAcceptRate: number | null;
      accepted: number;
      rejected: number;
    };
    cust: {
      acceptSec: PercentileRow;
      requestSuccessRate: number | null;
      requestsWithAccepted: number;
      totalRequests: number;
    };
  };
  money: {
    surveyPaid: { sum: number; count: number; avg: number | null };
    commission: { PENDING: number; PAID: number };
  };
  updatedAt: string;
};

export function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function numberOrNull(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}
function normalizePercentiles(row: PercentileRow | undefined): PercentileRow {
  return {
    mean: numberOrNull(row?.mean ?? null),
    median: numberOrNull(row?.median ?? null),
    p90: numberOrNull(row?.p90 ?? null),
  };
}


function countByStatus(rows: CountRow[]): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [row.status, row._count._all]));
}

const utcNaiveKstBucket = Prisma.sql`(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul')`;

/** Lightweight live queue counts; intentionally has no reporting date window. */
export async function getSummaryCounts(prisma: AnalyticsPrisma = defaultPrisma): Promise<{
  received: number;
  needsAttention: number;
  urgentOpen: number;
  updatedAt: string;
}> {
  const [received, needsAttention, urgentOpen] = await Promise.all([
    prisma.serviceRequest.count({ where: { status: 'RECEIVED' } }),
    prisma.serviceRequest.count({ where: { needsAttention: true } }),
    prisma.serviceRequest.count({
      where: {
        urgency: { in: ['CRITICAL', 'URGENT'] },
        status: { notIn: ['COMPLETED', 'CANCELED'] },
      },
    }),
  ]);

  return { received, needsAttention, urgentOpen, updatedAt: new Date().toISOString() };
}

// F8 고객 관점 표본: 접수당 최종 ACCEPTED 배정 1건만(DISTINCT ON + 최신 respondedAt·id 정렬).
// 프로덕션 percentile 집계와 DB 실행형 회귀 테스트가 동일 SQL을 공유하도록 export한다.
export function customerAcceptSampleSql(range: { gte: Date; lt: Date }) {
  return Prisma.sql`
    SELECT
      final_assignment."requestId" AS "requestId",
      EXTRACT(EPOCH FROM (final_assignment."respondedAt" - request."createdAt")) AS seconds
    FROM (
      SELECT DISTINCT ON (assignment."requestId")
        assignment."requestId",
        assignment."respondedAt"
      FROM "Assignment" AS assignment
      WHERE assignment.status = 'ACCEPTED'
      ORDER BY assignment."requestId", assignment."respondedAt" DESC, assignment.id DESC
    ) AS final_assignment
    JOIN "ServiceRequest" AS request ON request.id = final_assignment."requestId"
    WHERE final_assignment."respondedAt" >= (${range.gte} AT TIME ZONE 'UTC') AND final_assignment."respondedAt" < (${range.lt} AT TIME ZONE 'UTC')
  `;
}

export async function getDashboardStats(
  period: AnalyticsPeriod,
  prisma: AnalyticsPrisma = defaultPrisma,
): Promise<DashboardStats> {
  const range = kstRangeUtc(period);
  const firstOfferSql = Prisma.sql`
    SELECT
      AVG(EXTRACT(EPOCH FROM (first_assignment."createdAt" - request."createdAt"))) AS mean,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (first_assignment."createdAt" - request."createdAt"))) AS median,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (first_assignment."createdAt" - request."createdAt"))) AS p90
    FROM "ServiceRequest" AS request
    JOIN LATERAL (
      SELECT assignment."createdAt"
      FROM "Assignment" AS assignment
      WHERE assignment."requestId" = request.id
      ORDER BY assignment."createdAt" ASC
      LIMIT 1
    ) AS first_assignment ON TRUE
    WHERE request."createdAt" >= (${range.gte} AT TIME ZONE 'UTC') AND request."createdAt" < (${range.lt} AT TIME ZONE 'UTC')
  `;
  const customerAcceptSql = Prisma.sql`
    SELECT
      AVG(sample.seconds) AS mean,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY sample.seconds) AS median,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY sample.seconds) AS p90
    FROM (${customerAcceptSampleSql(range)}) AS sample
  `;
  const trendSql = Prisma.sql`
    WITH days AS (
      SELECT generate_series(
        date_trunc('day', (${range.gte} AT TIME ZONE 'Asia/Seoul')),
        date_trunc('day', (${range.lt} AT TIME ZONE 'Asia/Seoul')) - interval '1 day',
        interval '1 day'
      ) AS bucket
    ),
    events AS (
      SELECT date_trunc('day', ${utcNaiveKstBucket}) AS bucket, 1 AS received, 0 AS completed
      FROM "ServiceRequest"
      WHERE "createdAt" >= (${range.gte} AT TIME ZONE 'UTC') AND "createdAt" < (${range.lt} AT TIME ZONE 'UTC')
      UNION ALL
      SELECT date_trunc('day', (("completedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul')) AS bucket, 0 AS received, 1 AS completed
      FROM "ServiceRequest"
      WHERE "completedAt" >= (${range.gte} AT TIME ZONE 'UTC') AND "completedAt" < (${range.lt} AT TIME ZONE 'UTC')
    )
    SELECT to_char(days.bucket, 'YYYY-MM-DD') AS bucket,
           COALESCE(SUM(events.received), 0)::int AS received,
           COALESCE(SUM(events.completed), 0)::int AS completed
    FROM days
    LEFT JOIN events ON events.bucket = days.bucket
    GROUP BY days.bucket
    ORDER BY days.bucket ASC
  `;

  const [
    byStatus,
    responseStatuses,
    surveyPaid,
    commission,
    totalRequests,
    successRequests,
    needsAttention,
    byUrgencyOpen,
    firstOfferRows,
    customerAcceptRows,
    trendRows,
  ] = await Promise.all([
    prisma.serviceRequest.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.assignment.groupBy({
      by: ['status'],
      where: { status: { in: ['ACCEPTED', 'REJECTED'] }, respondedAt: range },
      _count: { _all: true },
    }),
    prisma.satisfactionSurvey.aggregate({
      where: { submittedAt: { not: null, ...range }, paidAmount: { not: null } },
      _sum: { paidAmount: true },
      _count: { paidAmount: true },
    }),
    prisma.commissionEntry.groupBy({
      by: ['status'],
      where: { createdAt: range },
      _sum: { amount: true },
    }),
    prisma.serviceRequest.count({ where: { createdAt: range } }),
    prisma.serviceRequest.count({
      where: { createdAt: range, assignments: { some: { status: 'ACCEPTED' } } },
    }),
    prisma.serviceRequest.count({ where: { needsAttention: true } }),
    prisma.serviceRequest.groupBy({
      by: ['urgency'],
      where: { status: { notIn: ['COMPLETED', 'CANCELED'] } },
      _count: { _all: true },
    }),
    prisma.$queryRaw<PercentileRow[]>(firstOfferSql),
    prisma.$queryRaw<PercentileRow[]>(customerAcceptSql),
    prisma.$queryRaw<TrendRow[]>(trendSql),
  ]);

  const responses = countByStatus(responseStatuses);
  const accepted = responses.ACCEPTED ?? 0;
  const rejected = responses.REJECTED ?? 0;
  const paidSum = surveyPaid._sum.paidAmount ?? 0;
  const paidCount = surveyPaid._count.paidAmount;
  const commissions = Object.fromEntries(
    (commission as AmountRow[]).map((row) => [row.status, row._sum.amount ?? 0]),
  ) as Record<string, number>;
  const urgencyOpen = Object.fromEntries(
    (byUrgencyOpen as Array<{ urgency: string; _count: { _all: number } }>).map((row) => [
      row.urgency,
      row._count._all,
    ]),
  ) as Record<string, number>;

  return {
    operational: {
      byStatus: countByStatus(byStatus),
      needsAttention,
      byUrgencyOpen: {
        CRITICAL: urgencyOpen.CRITICAL ?? 0,
        URGENT: urgencyOpen.URGENT ?? 0,
        NORMAL: urgencyOpen.NORMAL ?? 0,
      },
    },
    trend: trendRows.map((row) => ({
      bucket: row.bucket,
      received: Number(row.received),
      completed: Number(row.completed),
    })),
    performance: {
      op: {
        firstOfferSec: normalizePercentiles(firstOfferRows[0]),
        offerAcceptRate: ratio(accepted, accepted + rejected),
        accepted,
        rejected,
      },
      cust: {
        acceptSec: normalizePercentiles(customerAcceptRows[0]),
        requestSuccessRate: ratio(successRequests, totalRequests),
        requestsWithAccepted: successRequests,
        totalRequests,
      },
    },
    money: {
      surveyPaid: { sum: paidSum, count: paidCount, avg: ratio(paidSum, paidCount) },
      commission: { PENDING: commissions.PENDING ?? 0, PAID: commissions.PAID ?? 0 },
    },
    updatedAt: new Date().toISOString(),
  };
}
