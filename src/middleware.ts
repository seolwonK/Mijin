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
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.redirect(loginUrl);

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(process.env.AUTH_SECRET!),
    );
    if (isAdminArea && payload.role !== 'ADMIN') return NextResponse.redirect(loginUrl);
    if (isPartnerArea && payload.role !== 'PROVIDER') return NextResponse.redirect(loginUrl);
    if (isTechArea && payload.role !== 'TECHNICIAN') return NextResponse.redirect(loginUrl);
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ['/admin/:path*', '/partner/:path*', '/tech/:path*'],
};
