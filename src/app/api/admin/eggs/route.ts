import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { chargeEggs, adjustEggs, MIN_CHARGE_EGGS } from '@/lib/eggs';

// 알 크레딧 어드민 관리 — 충전(charge)·정정(adjust) + 잔액·장부 조회.
// 모든 입력 검증은 zod 한 곳으로 수렴(동일 상태코드 분기의 메시지 중복 방지 — gate 모호성 규칙).
const mutateSchema = z
  .object({
    kind: z.enum(['PROVIDER', 'TECHNICIAN']),
    id: z.string().min(1),
    action: z.enum(['charge', 'adjust']),
    count: z.number().int().min(MIN_CHARGE_EGGS).optional(), // charge 전용 (최소 3알)
    delta: z
      .number()
      .int()
      .refine((v) => v !== 0, '정정 delta는 0이 될 수 없습니다')
      .optional(), // adjust 전용
    memo: z.string().trim().min(1, '사유(memo)는 필수입니다'),
    chargeKey: z.string().trim().min(1).optional(), // charge 멱등 키 (더블서브밋 방어)
  })
  .refine((v) => (v.action === 'charge' ? v.count != null && v.chargeKey != null : true), {
    message: 'charge에는 count와 chargeKey가 필수입니다',
  })
  .refine((v) => (v.action === 'adjust' ? v.delta != null : true), {
    message: 'adjust에는 delta가 필수입니다',
  });

async function findTarget(kind: 'PROVIDER' | 'TECHNICIAN', id: string) {
  return kind === 'PROVIDER'
    ? prisma.provider.findUnique({ where: { id }, select: { id: true, eggBalance: true } })
    : prisma.technician.findUnique({ where: { id }, select: { id: true, eggBalance: true } });
}

export async function POST(req: NextRequest) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }
  const parsed = mutateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { kind, id, action, count, delta, memo, chargeKey } = parsed.data;

  const target = await findTarget(kind, id);
  if (!target) {
    return NextResponse.json({ error: '대상을 찾을 수 없습니다' }, { status: 404 });
  }

  if (action === 'charge') {
    const result = await chargeEggs(
      { kind, id },
      count!,
      memo,
      session.userId,
      chargeKey!,
    );
    const after = await findTarget(kind, id);
    return NextResponse.json({ ok: true, result, balance: after?.eggBalance ?? 0 });
  }

  try {
    await adjustEggs({ kind, id }, delta!, memo, session.userId);
  } catch (e) {
    if (e instanceof Error && e.message.includes('음수')) {
      return NextResponse.json(
        { error: '정정 결과 잔액이 음수가 될 수 없습니다' },
        { status: 409 },
      );
    }
    throw e;
  }
  const after = await findTarget(kind, id);
  return NextResponse.json({ ok: true, result: 'ADJUSTED', balance: after?.eggBalance ?? 0 });
}

const querySchema = z.object({
  kind: z.enum(['PROVIDER', 'TECHNICIAN']),
  id: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const session = await requireSession('ADMIN');
  if (!session) return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    kind: searchParams.get('kind'),
    id: searchParams.get('id'),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { kind, id } = parsed.data;

  const target = await findTarget(kind, id);
  if (!target) {
    return NextResponse.json({ error: '대상을 찾을 수 없습니다' }, { status: 404 });
  }

  const ledger = await prisma.eggLedger.findMany({
    where: kind === 'PROVIDER' ? { providerId: id } : { technicianId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      delta: true,
      reason: true,
      memo: true,
      actorAdminUserId: true,
      assignmentId: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ balance: target.eggBalance, ledger });
}
