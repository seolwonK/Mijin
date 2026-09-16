import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE = 'mijin_session';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // 공개 페이지(로그인·가입 신청)는 세션 보호에서 제외
  const partnerPublic = pathname === '/partner/login' || pathname === '/partner/signup';
  const techPublic = pathname === '/tech/login' || pathname === '/tech/signup';
  const isAdminArea = pathname.startsWith('/admin') && pathname !== '/admin/login';
  const isPartnerArea = pathname.startsWith('/partner') && !partnerPublic;
  const isTechArea = pathname.startsWith('/tech') && !techPublic;
  if (!isAdminArea && !isPartnerArea && !isTechArea) return NextResponse.next();

  const loginPath = isAdminArea
    ? '/admin/login'
    : isTechArea
      ? '/tech/login'
      : '/partner/login';
  const loginUrl = new URL(loginPath, req.url);
  // 로그인 후 원래 가려던 화면으로 돌아오도록 현재 경로를 returnTo 로 넘긴다.
  const withReturn = () => {
    const u = new URL(loginPath, req.url);
    u.searchParams.set('returnTo', pathname + req.nextUrl.search);
    return u;
  };
  // 로그인 뒤 화면은 크롤러에게 전부 noindex 다. 리다이렉트 응답 자체에 헤더를 붙이는 게 핵심 —
  // 안 붙이면 Google 이 /partner, /tech 같은 포털 루트 URL 을 리다이렉트 목적지의 제목("업체 로그인")
  // 으로 색인해 버린다(2026-09-16 실제로 두 URL 모두 색인돼 있었다). next.config 의 headers() 는
  // 미들웨어가 먼저 가로채는 이 응답에는 적용되지 않으므로 여기서 직접 건다.
  const redirectNoindex = (url: URL) => {
    const res = NextResponse.redirect(url);
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return res;
  };
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return redirectNoindex(withReturn());

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(process.env.AUTH_SECRET!),
    );
    // 역할 불일치는 계정 문제라 returnTo 없이 로그인으로 보낸다.
    if (isAdminArea && payload.role !== 'ADMIN') return redirectNoindex(loginUrl);
    if (isPartnerArea && payload.role !== 'PROVIDER') return redirectNoindex(loginUrl);
    if (isTechArea && payload.role !== 'TECHNICIAN') return redirectNoindex(loginUrl);
    // 인증을 통과한 포털 화면 본문도 색인 대상이 아니다.
    const res = NextResponse.next();
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return res;
  } catch {
    return redirectNoindex(withReturn());
  }
}

export const config = {
  matcher: ['/admin/:path*', '/partner/:path*', '/tech/:path*'],
};
