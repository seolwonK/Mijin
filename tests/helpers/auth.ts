import { SignJWT } from 'jose';
import { expect, type BrowserContext, type Page } from '@playwright/test';

// src/lib/auth.ts 와 동일한 세션 계약. 여기서 토큰을 직접 서명하는 이유는
// 계약(API) 층 테스트가 로그인 UI 를 거치지 않고 임의 역할·임의 대상의 세션을
// 즉시 만들 수 있어야 하기 때문이다.
export const SESSION_COOKIE = 'mijin_session';

export type SessionRole = 'ADMIN' | 'PROVIDER' | 'TECHNICIAN';

export type SessionPayload = {
  userId: string;
  role: SessionRole;
  name: string;
  providerId?: string;
  technicianId?: string;
};

export const ADMIN_CREDENTIALS = { loginId: 'admin', password: 'admin1234' } as const;

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      'AUTH_SECRET 이 테스트 프로세스에 없습니다. playwright.config.ts 최상단의 dotenv 로드를 확인하세요.',
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * src/lib/auth.ts:22-28 과 동일한 페이로드를 서명한다.
 * 검증측(auth.ts:32, middleware.ts:32-35)이 `jwtVerify(token, secret)` 를
 * **옵션 없이** 호출하므로 iss/aud/sub 는 필요 없다.
 *
 * ⚠️ TECHNICIAN/PROVIDER 는 technicianId/providerId 가 **반드시** 있어야 한다.
 * 빠뜨리면 requireSession() 은 통과하지만 예컨대
 * src/app/api/tech/jobs/[id]/status/route.ts:15-18 에서 401 이 나고,
 * 이는 진짜 인증 실패와 구분되지 않아 제품 결함으로 오보된다.
 */
export async function signSessionToken(payload: SessionPayload): Promise<string> {
  if (payload.role === 'TECHNICIAN' && !payload.technicianId) {
    throw new Error('TECHNICIAN 세션에는 technicianId 가 필요합니다 (tech 라우트가 401 을 낸다)');
  }
  if (payload.role === 'PROVIDER' && !payload.providerId) {
    throw new Error('PROVIDER 세션에는 providerId 가 필요합니다 (partner 라우트가 401 을 낸다)');
  }
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secretKey());
}

export type SessionCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Lax';
};

/**
 * 위조 세션 쿠키. `context.addCookies([...])` 또는 `request` 컨텍스트의
 * storageState 에 그대로 넣을 수 있는 형태로 돌려준다.
 */
export async function sessionCookieFor(
  role: SessionRole,
  ids: Omit<Partial<SessionPayload>, 'role'> = {},
  options: { domain?: string } = {},
): Promise<SessionCookie> {
  const token = await signSessionToken({
    userId: ids.userId ?? `e2e-${role.toLowerCase()}-user`,
    role,
    name: ids.name ?? `E2E ${role}`,
    ...(ids.providerId ? { providerId: ids.providerId } : {}),
    ...(ids.technicianId ? { technicianId: ids.technicianId } : {}),
  });
  return {
    name: SESSION_COOKIE,
    value: token,
    domain: options.domain ?? 'localhost',
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
  };
}

/** 세션 쿠키를 헤더 문자열로 — `request.post(url, { headers: { cookie } })` 용. */
export async function sessionCookieHeader(
  role: SessionRole,
  ids: Omit<Partial<SessionPayload>, 'role'> = {},
): Promise<string> {
  const cookie = await sessionCookieFor(role, ids);
  return `${cookie.name}=${cookie.value}`;
}

/** 브라우저 컨텍스트에 세션을 주입한다 (로그인 UI 를 거치지 않는 지름길). */
export async function seedSession(
  context: BrowserContext,
  role: SessionRole,
  ids: Omit<Partial<SessionPayload>, 'role'> = {},
): Promise<void> {
  await context.addCookies([await sessionCookieFor(role, ids)]);
}

/**
 * 계약 층 전용 APIRequestContext — 세션 쿠키와 (선택) 고유 IP 를 헤더로 고정한다.
 * `request.newContext()` 에 그대로 넘길 수 있는 옵션을 만든다.
 */
export async function apiContextOptions(
  role: SessionRole | null,
  ids: Omit<Partial<SessionPayload>, 'role'> = {},
  extra: Record<string, string> = {},
): Promise<{ baseURL: string; extraHTTPHeaders: Record<string, string> }> {
  const headers: Record<string, string> = { ...extra };
  if (role) headers.cookie = await sessionCookieHeader(role, ids);
  return { baseURL: 'http://localhost:3000', extraHTTPHeaders: headers };
}

/** 세션 없이 위조·손상 토큰을 넣고 싶을 때. */
export function rawCookieHeader(token: string): string {
  return `${SESSION_COOKIE}=${token}`;
}

// ───────────────────────────────────────────────────────────────────────────
// UI 층 로그인 — tests/admin-queue.spec.ts:22-28 의 기존 패턴을 그대로 옮긴 것.
// ───────────────────────────────────────────────────────────────────────────

export type Credentials = { loginId: string; password: string };

async function submitLogin(page: Page, path: string, creds: Credentials) {
  await page.goto(path);
  await page.locator('#loginId').fill(creds.loginId);
  await page.locator('#password').fill(creds.password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
}

/**
 * 로그인 완료 판정 — **로그인 페이지에 머무는 동안에는 반드시 거짓이어야 한다.**
 *
 * 이 불변식을 깨는 게 쉽다: `/\/tech(\/|$)/` 같은 패턴은 출발지인 `/tech/login`
 * 자체에 매치돼, 로그인이 아직 진행 중이거나 아예 실패했는데도 통과한다
 * (=인증 없는 세션으로 후속 단언이 돌아가는 false-green).
 *
 * 정규식 대신 pathname 완전일치 술어를 쓴다. 정규식은 `toHaveURL` 에서 비앵커
 * 검색이라 `/tech/login?returnTo=/tech` 처럼 쿼리에 목적지가 들어간 URL 까지
 * 매치될 수 있다. 술어는 그런 우회가 원천적으로 불가능하다.
 */
function arrivedAt(expectedPath: string) {
  if (/\/login$/.test(expectedPath)) {
    throw new Error(
      `로그인 완료 대상이 로그인 페이지입니다(${expectedPath}) — 이 단언은 항상 참이라 무의미합니다.`,
    );
  }
  return (url: URL) => url.pathname === expectedPath;
}

// LoginForm.tsx:51-63 — returnTo 가 없으면 목적지는 역할 접두 그 자체(/admin·/tech·/partner)이고,
// returnTo 가 그 역할의 경로면 그쪽으로 간다. submitLogin 은 쿼리 없는 로그인 경로로만
// 이동하므로 기본 목적지는 역할 접두다. returnTo 흐름을 태우는 호출부는 expectedPath 를 넘긴다
// (패턴을 다시 느슨하게 푸는 대신).
export async function loginAsAdmin(
  page: Page,
  creds: Credentials = ADMIN_CREDENTIALS,
  expectedPath = '/admin',
) {
  await submitLogin(page, '/admin/login', creds);
  await expect(page).toHaveURL(arrivedAt(expectedPath));
}

export async function loginAsTech(page: Page, creds: Credentials, expectedPath = '/tech') {
  await submitLogin(page, '/tech/login', creds);
  await expect(page).toHaveURL(arrivedAt(expectedPath));
}

export async function loginAsPartner(page: Page, creds: Credentials, expectedPath = '/partner') {
  await submitLogin(page, '/partner/login', creds);
  await expect(page).toHaveURL(arrivedAt(expectedPath));
}
