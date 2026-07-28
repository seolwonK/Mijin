import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { apiContextOptions, sessionCookieHeader, signSessionToken } from '../helpers/auth';
import { uniqueIp, runNonce } from '../helpers/ip';
import { FixtureFactory } from '../helpers/fixtures';
import { ANALYTICS_SHAPES, emptyFromShape, shapeViolations } from '../helpers/shapes';

const prisma = new PrismaClient();
test.afterAll(async () => prisma.$disconnect());

test('auth: ADMIN 세션은 200, 무세션은 401', async ({ playwright }) => {
  const authed = await playwright.request.newContext(await apiContextOptions('ADMIN'));
  const anon = await playwright.request.newContext(await apiContextOptions(null));
  expect((await authed.get('/api/admin/requests')).status()).toBe(200);
  expect((await anon.get('/api/admin/requests')).status()).toBe(401);
  await authed.dispose();
  await anon.dispose();
});

test('auth: 비ADMIN 세션에 id 를 빠뜨리면 헬퍼가 먼저 막는다', async () => {
  await expect(signSessionToken({ userId: 'u', role: 'TECHNICIAN', name: 'n' })).rejects.toThrow(
    /technicianId/,
  );
  await expect(signSessionToken({ userId: 'u', role: 'PROVIDER', name: 'n' })).rejects.toThrow(
    /providerId/,
  );
});

test('auth: technicianId 를 담은 세션은 tech 라우트를 통과한다', async ({ playwright }) => {
  const f = new FixtureFactory(prisma);
  const techFixture = await f.createTechFixture();
  const ctx = await playwright.request.newContext(
    await apiContextOptions('TECHNICIAN', {
      userId: techFixture.userId,
      technicianId: techFixture.technicianId,
    }),
  );
  expect((await ctx.get('/api/tech/jobs')).status()).toBe(200);
  await ctx.dispose();
  await f.cleanupAll();
});

test('ip: seed 마다 다르고 nonce 가 섞인다', () => {
  expect(uniqueIp('a')).not.toBe(uniqueIp('b'));
  expect(uniqueIp('a')).toBe(uniqueIp('a'));
  expect(runNonce()).toMatch(/^[0-9a-f]{4}$/);
  expect(uniqueIp('a')).toMatch(/^10\.\d+\.\d+\.\d+$/);
});

test('fixtures: 9001 대역 생성 후 cleanupAll 이 전부 되돌린다', async () => {
  const f = new FixtureFactory(prisma);
  const req = await f.createRequestFixture();
  const tech = await f.createTechFixture({ contractStatus: 'CONFIRMED' });
  const partner = await f.createPartnerFixture({ approvalStatus: 'PENDING' });
  const identity = await f.createIdentityVerification();

  expect(req.lookupCode).toMatch(/^9001\d{2}$/);
  expect(tech.loginId).toMatch(/^9001-tech-/);
  expect(partner.loginId).toMatch(/^9001-partner-/);
  expect(await prisma.employmentContract.count({ where: { technicianId: tech.technicianId } })).toBe(
    1,
  );

  await f.cleanupAll();

  expect(await prisma.serviceRequest.count({ where: { id: req.id } })).toBe(0);
  expect(await prisma.technician.count({ where: { id: tech.technicianId } })).toBe(0);
  expect(await prisma.provider.count({ where: { id: partner.providerId } })).toBe(0);
  // 이 팩토리가 만든 user 만 센다. `loginId startsWith '9001'` 로 전역을 세면
  // 병렬 워커의 **다른 스펙이 살아 있는 동안** 만든 9001 대역 픽스처까지 잡혀
  // cleanupAll 의 결함이 아닌데도 붉어진다 (tests/cross/ownership.spec.ts 와
  // 동시 실행 시 실제 재현). 나머지 5개 단언과 같은 id 스코프로 맞춘다.
  expect(
    await prisma.user.count({ where: { id: { in: [tech.userId, partner.userId] } } }),
  ).toBe(0);
  expect(await prisma.identityVerification.count({ where: { id: identity.id } })).toBe(0);
  expect(await prisma.employmentContract.count({ where: { technicianId: tech.technicianId } })).toBe(
    0,
  );
});

test('shapes: 실 analytics 응답이 상수 shape 를 만족한다', async ({ playwright }) => {
  const ctx = await playwright.request.newContext(await apiContextOptions('ADMIN'));
  const cases: Array<[keyof typeof ANALYTICS_SHAPES, string]> = [
    ['/api/admin/analytics/summary', '/api/admin/analytics/summary'],
    ['/api/admin/analytics/dashboard', '/api/admin/analytics/dashboard?period=day'],
    ['/api/admin/analytics/surveys', '/api/admin/analytics/surveys'],
    ['/api/admin/analytics/ratings', '/api/admin/analytics/ratings'],
    ['/api/admin/analytics/map/regions', '/api/admin/analytics/map/regions'],
    ['/api/admin/analytics/map/dispatch', '/api/admin/analytics/map/dispatch'],
  ];
  for (const [shapeKey, url] of cases) {
    const res = await ctx.get(url);
    expect(res.status(), url).toBe(200);
    expect(shapeViolations(await res.json(), ANALYTICS_SHAPES[shapeKey]), url).toEqual([]);
  }
  await ctx.dispose();
});

test('shapes: 목 골격도 같은 shape 를 만족한다 (Step 9 드리프트 결박)', () => {
  for (const [key, shape] of Object.entries(ANALYTICS_SHAPES)) {
    expect(shapeViolations(emptyFromShape(shape), shape), key).toEqual([]);
  }
});

test('auth: 쿠키 헤더 형태가 미들웨어를 통과한다', async ({ browser }) => {
  const context = await browser.newContext();
  const header = await sessionCookieHeader('ADMIN');
  expect(header.startsWith('mijin_session=')).toBe(true);
  await context.close();
});
