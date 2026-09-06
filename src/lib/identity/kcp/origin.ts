import type { NextRequest } from 'next/server';

// Ret_URL(KCP 가 인증 결과를 보낼 우리 주소)의 원점.
//
// 프로덕션은 APP_BASE_URL 만 믿는다(fail-closed). Ret_URL 은 KCP 상점관리자 「인증결과URL 설정」에 등록된
// 도메인이어야 하는데, 요청 헤더(host / x-forwarded-host)는 요청자가 정할 수 있어 그걸로 만든 Ret_URL 은
// 공격자 호스트를 가리킬 수 있다. KCP 의 도메인 허용목록이 막아 주긴 하지만 우리 코드가 검증할 수 없는
// 외부 통제이므로, 설정 누락을 조용히 헤더 폴백으로 넘기지 않고 여기서 멈춘다(config.ts 와 같은 원칙).
// 개발 환경만 헤더로 계산한다 — CloudType 컨테이너 안에서 req.nextUrl 은 내부 주소로 보이기 때문이다.
export function resolveOrigin(req: NextRequest): string {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'APP_BASE_URL 이 없습니다: 프로덕션에서 KCP Ret_URL 은 등록된 실도메인(APP_BASE_URL)으로만 만듭니다',
    );
  }
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const host =
    req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || req.headers.get('host')?.trim();
  if (host) return `${proto || 'http'}://${host}`;
  return req.nextUrl.origin;
}
