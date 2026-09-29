import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isCrossSiteRequest } from '@/lib/requestOrigin';

// 고객 비밀번호 변경 — 관리자가 전화로 불러 준 임시 비밀번호를 고객이 자기 것으로 바꾸는 길.
// 이 길이 없으면 임시 비밀번호를 관리자가 계속 알고 있는 상태로 남는다.

// 인메모리 레이트리밋: 계정당 10분에 5회 — 현재 비밀번호 대입을 막는다.
const hits = new Map<string, { count: number; resetAt: number }>();
function rateLimited(userId: string): boolean {
  const now = Date.now();
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
  }
  const h = hits.get(userId);
  if (!h || h.resetAt < now) {
    hits.set(userId, { count: 1, resetAt: now + 10 * 60_000 });
    return false;
  }
  h.count++;
  return h.count > 5;
}

const schema = z.object({
  currentPassword: z.string().min(1, '현재 비밀번호를 입력해 주세요'),
  // 신청서와 같은 규칙 — bcrypt 는 72바이트 뒤를 버린다.
  newPassword: z
    .string()
    .min(8, '새 비밀번호는 8자 이상')
    .refine((v) => new TextEncoder().encode(v).length <= 72, '비밀번호가 너무 깁니다(72바이트 이내)'),
});

export async function POST(req: NextRequest) {
  if (isCrossSiteRequest(req)) {
    return NextResponse.json({ error: '허용되지 않은 요청입니다' }, { status: 403 });
  }
  const session = await requireSession('CUSTOMER');
  if (!session) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 401 });
  }
  if (rateLimited(session.userId)) {
    return NextResponse.json(
      { error: '시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요' },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { passwordHash: true },
  });
  if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: '현재 비밀번호가 맞지 않습니다.' }, { status: 400 });
  }
  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return NextResponse.json({ error: '새 비밀번호가 지금과 같습니다.' }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 10) },
  });
  return NextResponse.json({ ok: true });
}
