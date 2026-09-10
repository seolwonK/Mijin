import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { getSurveyOverview } from '@/lib/surveyAnalytics';
import { prisma } from '@/lib/db';

const querySchema = z.object({
  status: z.enum(['ALL', 'SUBMITTED', 'PENDING']).default('ALL'),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  q: z.string().trim().max(100).default(''),
});

export async function GET(req: NextRequest) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: '설문 조회 조건을 확인해 주세요.' }, { status: 400 });
  }
  const overview = await getSurveyOverview(undefined, parsed.data);
  const logs = overview.surveys.items.length ? await prisma.smsLog.findMany({
    where: { requestId: { in: overview.surveys.items.map(item => item.requestId) }, body: { contains: '/survey/' } },
    distinct: ['requestId'], orderBy: { createdAt: 'desc' },
    select: { requestId: true, status: true, createdAt: true, provider: true },
  }) : [];
  const byRequest = new Map(logs.map(log => [log.requestId, log]));
  const surveys = { ...overview.surveys, items: overview.surveys.items.map(item => {
    const log = byRequest.get(item.requestId);
    return { ...item, delivery: log ? { status: log.status, createdAt: log.createdAt.toISOString(), simulated: log.provider === 'console' } : null };
  }) };
  return NextResponse.json({ ...overview, surveys }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
