import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

// 인메모리 레이트리밋: IP당 분당 10회. 전화번호 무차별 조회 방지용.
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

const lookupSchema = z.object({
  phone: z
    .string()
    .transform((s) => s.replace(/\D/g, ''))
    .pipe(z.string().regex(/^0\d{8,10}$/, '전화번호 형식이 올바르지 않습니다')),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }
  const parsed = lookupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요' },
      { status: 400 },
    );
  }

  const requests = await prisma.serviceRequest.findMany({
    where: { customerPhone: parsed.data.phone },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      assignments: {
        where: { status: { in: ['REQUESTED', 'ACCEPTED'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: {
          provider: { include: { user: { select: { name: true, phone: true } } } },
        },
      },
    },
  });

  return NextResponse.json({
    requests: requests.map((r) => {
      const active = r.assignments[0];
      return {
        id: r.id,
        lookupCode: r.lookupCode,
        customerName: r.customerName,
        status: r.status,
        urgency: r.urgency,
        description: r.description,
        address: r.address,
        createdAt: r.createdAt,
        completedAt: r.completedAt,
        provider: active
          ? { name: active.provider.user.name, phone: active.provider.user.phone }
          : null,
      };
    }),
  });
}
