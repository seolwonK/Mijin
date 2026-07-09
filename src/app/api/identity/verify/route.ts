import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { confirmIdentity } from '@/lib/identity';

// 휴대폰 본인인증 결과를 서버에서 재검증하고, 가입에 쓸 단기 verificationId 를 발급한다.
// 클라이언트는 여기서 받은 verificationId 를 가입 요청(/api/tech/signup)에 동봉한다.

const bodySchema = z.object({
  identityVerificationId: z.string().trim().min(1).max(200).optional(),
  name: z.string().trim().max(50).optional(),
  phone: z.string().trim().max(30).optional(),
});

// 인메모리 레이트리밋: IP당 10분에 10회 (인증 남용 방지)
const hits = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
  }
  const h = hits.get(ip);
  if (!h || h.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + 10 * 60_000 });
    return false;
  }
  h.count++;
  return h.count > 10;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값을 확인해 주세요' }, { status: 400 });
  }

  try {
    const { verificationId, name, phone } = await confirmIdentity(parsed.data);
    return NextResponse.json({ ok: true, verificationId, name, phone });
  } catch (e) {
    const message = e instanceof Error ? e.message : '본인인증에 실패했습니다';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
