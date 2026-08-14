import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// 가입 폼의 아이디 중복 확인. 존재 여부만 알려주는 공개 엔드포인트이므로
// 계정 열거 남용을 막기 위해 IP당 레이트리밋을 건다. 최종 중복 차단은
// 가입 API의 409와 User.loginId unique 제약이 담당한다 — 여기는 UX 보조.

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
  return h.count > 30;
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429 },
    );
  }

  const loginId = req.nextUrl.searchParams.get('loginId')?.trim() ?? '';
  if (loginId.length < 3 || loginId.length > 30) {
    return NextResponse.json(
      { error: '아이디는 3자 이상 30자 이하여야 합니다' },
      { status: 400 },
    );
  }

  const existing = await prisma.user.findUnique({
    where: { loginId },
    select: { id: true },
  });
  return NextResponse.json({ available: !existing });
}
