import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

export const SESSION_COOKIE = 'mijin_session';

export type SessionRole = 'ADMIN' | 'PROVIDER' | 'TECHNICIAN';

export type Session = {
  userId: string;
  role: SessionRole;
  name: string;
  providerId?: string;
  technicianId?: string;
};

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET 환경변수가 없습니다');
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(session: Session): Promise<string> {
  return new SignJWT(session)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * 세션에 담긴 **승인 상태**를 매 요청 재확인한다.
 *
 * 승인 여부는 로그인 시점(api/auth/login/route.ts:48-63)에만 검사됐다. 세션 토큰은
 * 7일짜리(아래 setExpirationTime)라, 승인된 업체·전기기사를 **반려해도 이미 발급된 세션이
 * 최대 일주일간 살아 있었다** — 반려가 접근 권한을 회수하지 못했다. JWT 는 발급 시점의
 * 상태를 담을 뿐 이후 변화를 알 수 없으므로, 회수를 즉시 반영하려면 요청마다 원본을 봐야 한다.
 *
 * 검사 대상은 `approvalStatus` **뿐이다.** 두 가지를 일부러 제외한다:
 *
 *   - `isActive` 는 관리자의 계정 비활성화가 아니라 **업체·전기기사가 스스로 켜고 끄는
 *     "영업 상태"** 다(partner/profile PATCH → profile/page.tsx:189 의 스위치).
 *     여기서 막으면 "영업 중지"로 바꾸는 순간 본인 포털에서 잠겨나가고, 다시 켜려면
 *     그 포털이 필요하므로 복구 불가능해진다. 배차 제외는 matching.ts 가 이미 담당한다.
 *   - **행이 없는 경우**는 통과시킨다. 세션이 삭제된 프로필을 가리키는 것은 권한 회수와
 *     다른 상황이고, 각 라우트가 이미 더 구체적인 404("전기기사 정보가 없습니다" 등)로
 *     처리한다. 여기서 401 로 가로채면 그 분기들이 통째로 도달 불가가 된다.
 *
 * ADMIN 은 profile 자체가 없어 조회하지 않는다 — 관리자 라우트 30개에 불필요한 쿼리를
 * 얹지 않기 위함이다. PROVIDER·TECHNICIAN 만 PK 조회 1건이 추가되고, 해당 라우트들은
 * 어차피 DB 를 타므로 실질 비용은 크지 않다.
 */
async function approvalRevoked(session: Session): Promise<boolean> {
  if (session.role === 'ADMIN') return false;

  if (session.role === 'PROVIDER') {
    if (!session.providerId) return false; // 라우트가 자체적으로 처리한다
    const p = await prisma.provider.findUnique({
      where: { id: session.providerId },
      select: { approvalStatus: true },
    });
    return p != null && p.approvalStatus !== 'APPROVED';
  }

  if (!session.technicianId) return false;
  const t = await prisma.technician.findUnique({
    where: { id: session.technicianId },
    select: { approvalStatus: true },
  });
  return t != null && t.approvalStatus !== 'APPROVED';
}

export async function requireSession(role: SessionRole): Promise<Session | null> {
  const session = await getSession();
  if (!session || session.role !== role) return null;
  // 승인이 회수됐으면 토큰 자체는 유효해도 거부한다 — 호출부는 기존대로 401 을 낸다.
  return (await approvalRevoked(session)) ? null : session;
}
