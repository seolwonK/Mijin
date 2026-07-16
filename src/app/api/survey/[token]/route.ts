import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { accrueCommissionForSurvey } from '@/lib/commission';

// 인메모리 레이트리밋: IP당 분당 10회. 토큰 무차별 대입 방지용 (requests/lookup/route.ts와 동형).
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
  }
  const h = hits.get(ip);
  if (!h || h.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  h.count++;
  return h.count > 10;
}

const submitSchema = z.object({
  rating: z.number().int('별점을 선택해 주세요').min(1, '별점을 선택해 주세요').max(5, '별점은 5점까지입니다'),
  paidAmount: z
    .number()
    .int('지불 금액을 정확히 입력해 주세요')
    .min(0, '지불 금액을 정확히 입력해 주세요')
    .max(100_000_000, '지불 금액이 너무 큽니다'),
  comment: z.string().max(500, '후기는 500자 이내로 입력해 주세요').optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const survey = await prisma.satisfactionSurvey.findUnique({
    where: { token },
    include: { request: { select: { completedAt: true } } },
  });
  if (!survey) {
    return NextResponse.json({ error: '설문을 찾을 수 없습니다' }, { status: 404 });
  }

  return NextResponse.json({
    submitted: survey.submittedAt != null,
    completedAt: survey.request.completedAt,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429 },
    );
  }

  const { token } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요' },
      { status: 400 },
    );
  }

  // 1회 제출 CAS — submittedAt이 null인 행만 갱신 대상.
  const updated = await prisma.satisfactionSurvey.updateMany({
    where: { token, submittedAt: null },
    data: {
      rating: parsed.data.rating,
      comment: parsed.data.comment || null,
      paidAmount: parsed.data.paidAmount,
      submittedAt: new Date(),
    },
  });
  if (updated.count === 0) {
    const exists = await prisma.satisfactionSurvey.findUnique({ where: { token } });
    if (exists) {
      return NextResponse.json({ error: '이미 제출된 설문입니다' }, { status: 409 });
    }
    return NextResponse.json({ error: '설문을 찾을 수 없습니다' }, { status: 404 });
  }

  // 소개 수수료 적립 — SMS 등과 달리 내구성이 지연보다 중요해 await(실패해도 제출 응답은 깨지 않음).
  try {
    await accrueCommissionForSurvey(token);
  } catch (e) {
    console.error('[commission] 적립 실패', e);
  }

  return NextResponse.json({ ok: true });
}
