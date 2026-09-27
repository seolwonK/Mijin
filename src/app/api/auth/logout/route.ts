import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';
import { isCrossSiteRequest } from '@/lib/requestOrigin';

export async function POST(req: NextRequest) {
  // 다른 사이트가 폼 제출로 사용자를 강제 로그아웃시키지 못하게 한다(Origin 없는 비브라우저 호출은 통과).
  if (isCrossSiteRequest(req)) {
    return NextResponse.json({ error: '허용되지 않은 요청입니다' }, { status: 403 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
