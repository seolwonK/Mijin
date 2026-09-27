// 세션 토큰의 역할별 수명·슬라이딩 갱신 규칙.
//
// 순수 모듈이다(jose 외 의존 없음). src/lib/auth.ts 는 prisma·next/headers 를 가져와
// 미들웨어에서 import 할 수 없으므로, 미들웨어와 auth.ts 가 함께 쓰는 규칙을 여기 둔다.
import { SignJWT } from 'jose';

const DAY_SECONDS = 60 * 60 * 24;

export type SessionClaims = {
  userId: string;
  role: 'ADMIN' | 'PROVIDER' | 'TECHNICIAN' | 'CUSTOMER';
  name: string;
  providerId?: string;
  technicianId?: string;
};

/**
 * 점검 구독 고객(CUSTOMER)은 분기 1회 방문 확인 정도로만 들어오므로 30일, 나머지 역할은 7일.
 * JWT 만료와 쿠키 maxAge 는 반드시 이 값을 같이 쓴다.
 */
export function sessionMaxAgeSeconds(role: string): number {
  return role === 'CUSTOMER' ? 30 * DAY_SECONDS : 7 * DAY_SECONDS;
}

/** 남은 기간이 이보다 짧은 CUSTOMER 세션은 /my 방문 시 재발급한다. */
export const CUSTOMER_REFRESH_THRESHOLD_SECONDS = 15 * DAY_SECONDS;

/** payload 의 exp(초)와 현재 시각(초)으로 재발급 여부를 판정한다. */
export function shouldRefreshSession(
  payload: { role?: unknown; exp?: unknown },
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (payload.role !== 'CUSTOMER') return false;
  if (typeof payload.exp !== 'number') return false;
  const remaining = payload.exp - nowSeconds;
  return remaining > 0 && remaining < CUSTOMER_REFRESH_THRESHOLD_SECONDS;
}

/** 서명된 페이로드에서 세션 필드만 골라낸다(iat·exp 등 등록 클레임 제외). */
export function pickSessionClaims(payload: Record<string, unknown>): SessionClaims {
  return {
    userId: String(payload.userId),
    role: payload.role as SessionClaims['role'],
    name: String(payload.name),
    ...(typeof payload.providerId === 'string' ? { providerId: payload.providerId } : {}),
    ...(typeof payload.technicianId === 'string' ? { technicianId: payload.technicianId } : {}),
  };
}

export async function signSession(
  session: SessionClaims,
  secret: Uint8Array,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + sessionMaxAgeSeconds(session.role))
    .sign(secret);
}

/** 쿠키 속성 — login·apply·미들웨어 재발급이 모두 같은 값을 쓴다. */
export function sessionCookieOptions(role: string) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: sessionMaxAgeSeconds(role),
  };
}
