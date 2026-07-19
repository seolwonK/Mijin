import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db';

export type RatingSubjectKind = 'PROVIDER' | 'TECHNICIAN';
export type RatingRanking = {
  subjectKey: `${RatingSubjectKind}:${string}`;
  name: string;
  type: RatingSubjectKind;
  avgRating: number | null;
  reviewCount: number;
  completed: number;
};

export type RatingsAnalyticsPrisma = Pick<PrismaClient, '$queryRaw'> & {
  satisfactionSurvey: Pick<PrismaClient['satisfactionSurvey'], 'count' | 'groupBy' | 'findMany'>;
  assignment: Pick<PrismaClient['assignment'], 'groupBy'>;
  user: Pick<PrismaClient['user'], 'findMany'>;
};

type Subject = { kind: RatingSubjectKind; id: string };
type RatingGroup = { providerId?: string | null; technicianId?: string | null; _avg: { rating: number | null }; _count: { rating: number } };
type CompletedGroup = { providerId?: string | null; technicianId?: string | null; requestId: string; _count: { _all: number } };
type MonthlyRow = { bucket: string; avgRating: number | string | null; reviewCount: number | string };
const REVIEW_PAGE_SIZE = 30;

export function parseRatingSubject(subject: string): Subject | null {
  const match = /^(PROVIDER|TECHNICIAN):([^:]+)$/.exec(subject);
  return match ? { kind: match[1] as RatingSubjectKind, id: match[2] } : null;
}

function keyOf(kind: RatingSubjectKind, id: string): `${RatingSubjectKind}:${string}` {
  return `${kind}:${id}`;
}

function putGroup<T extends RatingGroup | CompletedGroup>(
  rows: T[],
  kind: RatingSubjectKind,
  apply: (key: `${RatingSubjectKind}:${string}`, row: T) => void,
) {
  for (const row of rows) {
    const id = kind === 'PROVIDER' ? row.providerId : row.technicianId;
    if (id) apply(keyOf(kind, id), row);
  }
}

export async function getRatingsRanking(prisma: RatingsAnalyticsPrisma = defaultPrisma): Promise<{ ranking: RatingRanking[] }> {
  const [providerRatings, technicianRatings, providerCompleted, technicianCompleted] = await Promise.all([
    prisma.satisfactionSurvey.groupBy({ by: ['providerId'], where: { providerId: { not: null }, rating: { not: null }, submittedAt: { not: null } }, _avg: { rating: true }, _count: { rating: true } }),
    prisma.satisfactionSurvey.groupBy({ by: ['technicianId'], where: { technicianId: { not: null }, rating: { not: null }, submittedAt: { not: null } }, _avg: { rating: true }, _count: { rating: true } }),
    prisma.assignment.groupBy({ by: ['providerId', 'requestId'], where: { providerId: { not: null }, status: 'ACCEPTED', request: { status: 'COMPLETED' } }, _count: { _all: true } }),
    prisma.assignment.groupBy({ by: ['technicianId', 'requestId'], where: { technicianId: { not: null }, status: 'ACCEPTED', request: { status: 'COMPLETED' } }, _count: { _all: true } }),
  ]);

  const values = new Map<`${RatingSubjectKind}:${string}`, Omit<RatingRanking, 'name'>>();
  const ensure = (key: `${RatingSubjectKind}:${string}`) => {
    const current = values.get(key);
    if (current) return current;
    const type = key.split(':', 1)[0] as RatingSubjectKind;
    const next = { subjectKey: key, type, avgRating: null, reviewCount: 0, completed: 0 };
    values.set(key, next);
    return next;
  };
  putGroup(providerRatings as RatingGroup[], 'PROVIDER', (key, row) => {
    const value = ensure(key); value.avgRating = row._avg.rating; value.reviewCount = row._count.rating;
  });
  putGroup(technicianRatings as RatingGroup[], 'TECHNICIAN', (key, row) => {
    const value = ensure(key); value.avgRating = row._avg.rating; value.reviewCount = row._count.rating;
  });
  putGroup(providerCompleted as CompletedGroup[], 'PROVIDER', (key) => { ensure(key).completed += 1; });
  putGroup(technicianCompleted as CompletedGroup[], 'TECHNICIAN', (key) => { ensure(key).completed += 1; });

  const providerIds = [...values.values()].filter((item) => item.type === 'PROVIDER').map((item) => item.subjectKey.slice('PROVIDER:'.length));
  const technicianIds = [...values.values()].filter((item) => item.type === 'TECHNICIAN').map((item) => item.subjectKey.slice('TECHNICIAN:'.length));
  const users = providerIds.length + technicianIds.length === 0 ? [] : await prisma.user.findMany({
    where: { OR: [{ provider: { id: { in: providerIds } } }, { technician: { id: { in: technicianIds } } }] },
    select: { name: true, provider: { select: { id: true } }, technician: { select: { id: true } } },
  });
  const names = new Map<`${RatingSubjectKind}:${string}`, string>();
  for (const user of users) {
    if (user.provider) names.set(keyOf('PROVIDER', user.provider.id), user.name);
    if (user.technician) names.set(keyOf('TECHNICIAN', user.technician.id), user.name);
  }

  const ranking = [...values.values()].map((item) => ({ ...item, name: names.get(item.subjectKey) ?? `삭제된 대상 · ${item.subjectKey.slice(item.type.length + 1, item.type.length + 9)}` }));
  ranking.sort((a, b) => {
    if (a.avgRating !== b.avgRating) {
      if (a.avgRating === null) return 1;
      if (b.avgRating === null) return -1;
      return b.avgRating - a.avgRating;
    }
    return b.reviewCount - a.reviewCount || a.subjectKey.localeCompare(b.subjectKey);
  });
  return { ranking };
}

export async function getRatingSubjectDetail(kind: RatingSubjectKind, id: string, cursor?: string, prisma: RatingsAnalyticsPrisma = defaultPrisma) {
  const field = kind === 'PROVIDER' ? Prisma.sql`"providerId"` : Prisma.sql`"technicianId"`;
  const monthlySql = Prisma.sql`
    SELECT to_char(date_trunc('month', (("submittedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul')), 'YYYY-MM') AS bucket,
           AVG("rating") AS "avgRating", COUNT("rating")::int AS "reviewCount"
    FROM "SatisfactionSurvey"
    WHERE ${field} = ${id} AND "submittedAt" IS NOT NULL AND "rating" IS NOT NULL
    GROUP BY 1 ORDER BY 1 ASC
  `;
  const where = kind === 'PROVIDER' ? { providerId: id } : { technicianId: id };
  const [monthlyRows, reviews, total] = await Promise.all([
    prisma.$queryRaw<MonthlyRow[]>(monthlySql),
    prisma.satisfactionSurvey.findMany({
      where: { ...where, submittedAt: { not: null }, rating: { not: null } },
      select: { id: true, rating: true, comment: true, submittedAt: true },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: REVIEW_PAGE_SIZE + 1,
    }),
    prisma.satisfactionSurvey.count({ where: { ...where, submittedAt: { not: null }, rating: { not: null } } }),
  ]);
  const items = reviews.slice(0, REVIEW_PAGE_SIZE);
  const hasNext = reviews.length > REVIEW_PAGE_SIZE;
  return {
    monthly: monthlyRows.map((row) => ({ bucket: row.bucket, avgRating: row.avgRating == null ? null : Number(row.avgRating), reviewCount: Number(row.reviewCount) })),
    reviews: {
      items: items.map((review) => ({ rating: review.rating!, comment: review.comment, submittedAt: review.submittedAt!.toISOString() })),
      total,
      hasNext,
      nextCursor: hasNext ? items[items.length - 1]?.id ?? null : null,
    },
  };
}
