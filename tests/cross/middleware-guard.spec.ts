import { expect, test, type APIRequestContext } from '@playwright/test';
import { SignJWT } from 'jose';
import { rawCookieHeader, sessionCookieHeader, type SessionRole } from '../helpers/auth';
import { ipHeaders } from '../helpers/ip';

// ───────────────────────────────────────────────────────────────────────────
// 페이지 층 가드 (계획 Step 3c) — src/middleware.ts
//
// API 층(auth-matrix)과 달리 여기서 검증하는 건 **리다이렉트 계약**이다.
// 브라우저로 렌더까지 기다리지 않고 request 컨텍스트에 maxRedirects:0 을 줘서
// 307 과 Location 을 직접 읽는다: 최종 URL 만 보면 "returnTo 가 붙었는지"와
// "로그인 페이지가 스스로 리다이렉트했는지"를 구분할 수 없다.
//
//   :24-30  무세션 → 로그인 + returnTo(원래 경로+쿼리)
//   :8-12   공개 예외 5개는 통과
//   :38-41  역할 불일치 → 로그인, **returnTo 없이** (계정 문제라 되돌릴 곳이 없다)
//   :43     검증 실패(위조·만료) → catch → returnTo 붙여 로그인
// ───────────────────────────────────────────────────────────────────────────

const LOGIN_FOR = {
  '/admin': '/admin/login',
  '/partner': '/partner/login',
  '/tech': '/tech/login',
} as const;

let anon: APIRequestContext;

test.beforeAll(async ({ playwright }) => {
  anon = await playwright.request.newContext({
    baseURL: 'http://localhost:3000',
    maxRedirects: 0,
    extraHTTPHeaders: ipHeaders('middleware-anon'),
  });
});
test.afterAll(async () => anon.dispose());

async function ctxWithCookie(
  playwright: import('@playwright/test').PlaywrightWorkerArgs['playwright'],
  cookie: string,
  seed: string,
): Promise<APIRequestContext> {
  return playwright.request.newContext({
    baseURL: 'http://localhost:3000',
    maxRedirects: 0,
    extraHTTPHeaders: { cookie, ...ipHeaders(seed) },
  });
}

function redirectTarget(location: string | undefined): URL {
  expect(location, 'Location 헤더가 없다 — 리다이렉트가 아니다').toBeTruthy();
  return new URL(location!, 'http://localhost:3000');
}

test('무세션은 로그인으로 리다이렉트되고 returnTo 에 원래 경로가 보존된다', async () => {
  for (const [area, login] of Object.entries(LOGIN_FOR)) {
    const res = await anon.get(area);
    expect(res.status(), `${area} 는 리다이렉트되어야 한다`).toBe(307);
    const target = redirectTarget(res.headers()['location']);
    expect(target.pathname, area).toBe(login);
    expect(target.searchParams.get('returnTo'), area).toBe(area);
  }
});

test('returnTo 는 하위 경로와 쿼리스트링까지 그대로 보존한다', async () => {
  const res = await anon.get('/admin/settlements?month=2026-07');
  expect(res.status()).toBe(307);
  const target = redirectTarget(res.headers()['location']);
  expect(target.pathname).toBe('/admin/login');
  expect(target.searchParams.get('returnTo')).toBe('/admin/settlements?month=2026-07');
});

test('공개 예외 5개는 리다이렉트되지 않는다', async () => {
  const publicPages = [
    '/admin/login',
    '/partner/login',
    '/partner/signup',
    '/tech/login',
    '/tech/signup',
  ];
  for (const path of publicPages) {
    const res = await anon.get(path);
    expect(res.status(), `${path} 는 공개 페이지다`).toBe(200);
  }
});

test('역할 불일치는 returnTo 없이 로그인으로 보낸다', async ({ playwright }) => {
  // middleware.ts:37-39 — 세션은 유효하지만 영역이 다르다. 로그인해도 그 경로로는
  // 못 가므로 returnTo 를 붙이지 않는 것이 의도된 동작이다.
  const cases: Array<[SessionRole, string, string]> = [
    ['TECHNICIAN', '/admin', '/admin/login'],
    ['PROVIDER', '/tech', '/tech/login'],
    ['ADMIN', '/partner', '/partner/login'],
  ];
  for (const [role, area, login] of cases) {
    const ids =
      role === 'TECHNICIAN'
        ? { technicianId: 'e2e-mw-tech' }
        : role === 'PROVIDER'
          ? { providerId: 'e2e-mw-partner' }
          : {};
    const ctx = await ctxWithCookie(
      playwright,
      await sessionCookieHeader(role, ids),
      `middleware-${role}`,
    );
    const res = await ctx.get(area);
    expect(res.status(), `${role} → ${area}`).toBe(307);
    const target = redirectTarget(res.headers()['location']);
    expect(target.pathname, `${role} → ${area}`).toBe(login);
    expect(target.searchParams.has('returnTo'), `${role} → ${area} 는 returnTo 가 없어야 한다`).toBe(
      false,
    );
    await ctx.dispose();
  }
});

test('위조 토큰은 검증 실패로 로그인 리다이렉트된다', async ({ playwright }) => {
  const ctx = await ctxWithCookie(
    playwright,
    rawCookieHeader('this.is.not.a.valid.jwt'),
    'middleware-forged',
  );
  const res = await ctx.get('/admin');
  expect(res.status()).toBe(307);
  const target = redirectTarget(res.headers()['location']);
  expect(target.pathname).toBe('/admin/login');
  // catch 분기(:43)는 withReturn() 을 쓴다 — 로그인하면 원래 경로로 돌아간다.
  expect(target.searchParams.get('returnTo')).toBe('/admin');
  await ctx.dispose();
});

test('다른 비밀키로 서명한 토큰은 통과하지 못한다', async ({ playwright }) => {
  const wrongKey = new TextEncoder().encode('this-is-not-the-real-auth-secret-000000');
  const token = await new SignJWT({ userId: 'x', role: 'ADMIN', name: '위조' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(wrongKey);
  const ctx = await ctxWithCookie(playwright, rawCookieHeader(token), 'middleware-wrongkey');
  const res = await ctx.get('/admin');
  expect(res.status()).toBe(307);
  expect(redirectTarget(res.headers()['location']).pathname).toBe('/admin/login');
  await ctx.dispose();
});

test('만료된 토큰은 통과하지 못한다', async ({ playwright }) => {
  const secret = process.env.AUTH_SECRET;
  expect(secret, 'AUTH_SECRET 이 없다 — playwright.config.ts 의 dotenv 로드 확인').toBeTruthy();
  const token = await new SignJWT({ userId: 'x', role: 'ADMIN', name: '만료' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
    .sign(new TextEncoder().encode(secret!));
  const ctx = await ctxWithCookie(playwright, rawCookieHeader(token), 'middleware-expired');
  const res = await ctx.get('/admin');
  expect(res.status()).toBe(307);
  const target = redirectTarget(res.headers()['location']);
  expect(target.pathname).toBe('/admin/login');
  expect(target.searchParams.get('returnTo')).toBe('/admin');
  await ctx.dispose();
});

test('유효한 ADMIN 세션은 리다이렉트되지 않는다 (307 이 무조건이 아님)', async ({
  playwright,
}) => {
  const ctx = await ctxWithCookie(
    playwright,
    await sessionCookieHeader('ADMIN'),
    'middleware-admin-ok',
  );
  const res = await ctx.get('/admin');
  expect(res.status(), '/admin 은 ADMIN 세션에서 렌더되어야 한다').toBe(200);
  await ctx.dispose();
});
