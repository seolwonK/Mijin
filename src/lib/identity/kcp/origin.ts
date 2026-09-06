import type { NextRequest } from 'next/server';

// Ret_URL(KCP 가 인증 결과를 보낼 우리 주소)의 원점.
// KCP 상점관리자 「인증결과URL 설정」에 등록된 도메인이어야 하므로 APP_BASE_URL 을 우선하고,
// 없으면 프록시 헤더(x-forwarded-*)로 계산한다 — CloudType 컨테이너 안에서 req.nextUrl 은 내부 주소로 보인다.
export function resolveOrigin(req: NextRequest): string {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const host =
    req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || req.headers.get('host')?.trim();
  if (host) return `${proto || 'https'}://${host}`;
  return req.nextUrl.origin;
}
