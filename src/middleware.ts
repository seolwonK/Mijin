import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE = 'mijin_session';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAdminArea = pathname.startsWith('/admin') && pathname !== '/admin/login';
  const isPartnerArea = pathname.startsWith('/partner') && pathname !== '/partner/login';
  if (!isAdminArea && !isPartnerArea) return NextResponse.next();

  const loginUrl = new URL(isAdminArea ? '/admin/login' : '/partner/login', req.url);
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.redirect(loginUrl);

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(process.env.AUTH_SECRET!),
    );
    if (isAdminArea && payload.role !== 'ADMIN') return NextResponse.redirect(loginUrl);
    if (isPartnerArea && payload.role !== 'PROVIDER') return NextResponse.redirect(loginUrl);
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ['/admin/:path*', '/partner/:path*'],
};
