import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { FixtureFactory, ephemeralPhone } from '../helpers/fixtures';
import { apiContextOptions, loginAsAdmin } from '../helpers/auth';
import { ipHeaders } from '../helpers/ip';

// This suite turns automatic assignment on only in the disposable audit DB.
// Run serially through scripts/assignment-audit.mjs --full.
test.skip(process.env.ASSIGNMENT_AUDIT !== '1', 'Use the isolated assignment audit runner');
const prisma = new PrismaClient();
let f: FixtureFactory;
const geo = { address: '서울특별시 강남구 테헤란로 1', lat: 37.5, lng: 127 };
test.beforeAll(() => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!url.pathname.startsWith('/mijin_assignment_audit_') || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Disposable local database required');
});
test.beforeEach(() => { f = new FixtureFactory(prisma); });
test.afterEach(async () => {
  await prisma.appSettings.update({ where: { id: 1 }, data: { autoAssignEnabled: false } });
  await f.cleanupAll();
});
test.afterAll(async () => prisma.$disconnect());

for (const [path, owner] of [
  ['/api/admin/requests/missing/assign', 'ADMIN'],
  ['/api/admin/requests/missing/unassign', 'ADMIN'],
  ['/api/admin/requests/missing/cancel', 'ADMIN'],
  ['/api/partner/jobs/missing/accept', 'PROVIDER'],
  ['/api/partner/jobs/missing/reject', 'PROVIDER'],
  ['/api/tech/jobs/missing/accept', 'TECHNICIAN'],
  ['/api/tech/jobs/missing/reject', 'TECHNICIAN'],
] as const) {
  test(`H03 ${path}: 무세션·교차 역할 차단 및 올바른 역할 양성 대조`, async ({ playwright }) => {
    for (const role of [null, 'ADMIN', 'PROVIDER', 'TECHNICIAN'] as const) {
      const ctx = await playwright.request.newContext(await apiContextOptions(role, { providerId: 'missing', technicianId: 'missing' }, ipHeaders(`auth-${path}-${role}`)));
      try {
        const response = await ctx.post(path, { data: {} });
        if (role === owner) expect(response.status()).not.toBe(401);
        else expect(response.status()).toBe(401);
      } finally { await ctx.dispose(); }
    }
  });
}

for (const kind of ['PROVIDER', 'TECHNICIAN'] as const) for (const urgency of ['NORMAL', 'URGENT', 'CRITICAL'] as const) {
  test(`H01 고객 실제 접수 → ${urgency} ${kind} 즉시 자동배정 → 문자 기록 → 수락`, async ({ playwright }) => {
    const p = await f.createPartnerFixture(geo);
    const t = await f.createTechFixture({ ...geo, contractStatus: 'CONFIRMED' });
    const id = kind === 'PROVIDER' ? p.providerId : t.technicianId;
    if (kind === 'PROVIDER') await prisma.provider.update({ where: { id }, data: { eggBalance: 30 } });
    else await prisma.technician.update({ where: { id }, data: { eggBalance: 30 } });
    await prisma.appSettings.update({ where: { id: 1 }, data: { autoAssignEnabled: true } });
    const customer = await playwright.request.newContext(await apiContextOptions(null, {}, ipHeaders(`intake-${kind}-${urgency}`)));
    const sessionIds = kind === 'PROVIDER' ? { userId: p.userId, providerId: id } : { userId: t.userId, technicianId: id };
    const portal = await playwright.request.newContext(await apiContextOptions(kind, sessionIds, ipHeaders(`portal-${kind}-${urgency}`)));
    try {
      const res = await customer.post('/api/requests', { data: { ...geo, urgency, customerName: '자동배정 통합 검증', customerPhone: ephemeralPhone(), description: '차단기 점검 요청 테스트' } });
      const body = await res.json(); if (body.id) f.trackRequest(body.id);
      expect(res.status(), JSON.stringify(body)).toBe(200);
      await expect.poll(() => prisma.assignment.count({ where: { requestId: body.id } })).toBe(1);
      const assignment = await prisma.assignment.findFirstOrThrow({ where: { requestId: body.id } });
      expect(assignment).toMatchObject({ assignedBy: 'AUTO', status: 'REQUESTED', ...(kind === 'PROVIDER' ? { providerId: id, technicianId: null } : { technicianId: id, providerId: null }) });
      await expect.poll(() => prisma.smsLog.count({ where: { requestId: body.id, body: { contains: '새 출동 배정' }, provider: 'console' } })).toBe(1);
      const endpoint = `/api/${kind === 'PROVIDER' ? 'partner' : 'tech'}/jobs/${assignment.id}/accept`;
      expect((await portal.post(endpoint)).status()).toBe(200);
      expect((await portal.post(endpoint)).status()).toBe(409);
      expect((await prisma.serviceRequest.findUniqueOrThrow({ where: { id: body.id } })).status).toBe('ACCEPTED');
      expect(await prisma.eggLedger.count({ where: { assignmentId: assignment.id } })).toBe(1);
    } finally { await customer.dispose(); await portal.dispose(); }
  });
}

for (const urgency of ['NORMAL', 'URGENT', 'CRITICAL'] as const) {
  test(`H02 ${urgency} HTTP cron: 기한 초과 회수·다음 후보 재배정·밀린 신규 접수 처리`, async ({ playwright }) => {
    const old = await f.createPartnerFixture(geo);
    const next = await f.createTechFixture({ ...geo, contractStatus: 'CONFIRMED' });
    const stale = await f.createRequestFixture({ ...geo, urgency, status: 'ASSIGNED' });
    const fresh = await f.createRequestFixture({ ...geo, urgency, status: 'RECEIVED', assignBaseAt: new Date(0) });
    const first = await prisma.assignment.create({ data: { requestId: stale.id, providerId: old.providerId, assignedBy: 'ADMIN', createdAt: new Date(Date.now() - 601_000) } });
    await prisma.appSettings.update({ where: { id: 1 }, data: { autoAssignEnabled: true } });
    const cron = await playwright.request.newContext(await apiContextOptions(null, {}, ipHeaders(`cron-${urgency}`)));
    try {
      const response = await cron.post('/api/internal/auto-assign', { headers: { 'x-cron-secret': process.env.CRON_SECRET! } });
      expect(response.status()).toBe(200);
      expect((await prisma.assignment.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('EXPIRED');
      expect(await prisma.assignment.findFirst({ where: { requestId: stale.id, status: 'REQUESTED' } })).toMatchObject({ technicianId: next.technicianId, assignedBy: 'AUTO' });
      expect((await prisma.serviceRequest.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe('ASSIGNED');
      const again = await cron.get('/api/internal/auto-assign', { headers: { authorization: `Bearer ${process.env.CRON_SECRET!}` } });
      expect(await again.json()).toEqual({ assigned: 0, recalled: 0 });
    } finally { await cron.dispose(); }
  });
}

for (const kind of ['PROVIDER', 'TECHNICIAN'] as const) for (const width of [390, 1440]) {
  test(`U01 ${width}px ${kind}: 실제 화면에서 확인 취소 → 낮은 순위 수동배정 → 회수 → 재배정 → 접수 취소`, async ({ page }) => {
    const p = await f.createPartnerFixture(geo);
    const t = await f.createTechFixture({ ...geo, contractStatus: 'CONFIRMED' });
    const req = await f.createRequestFixture({ ...geo, status: 'RECEIVED' });
    // Opposite kind ranks first. Manual selection must still assign the clicked target.
    if (kind === 'PROVIDER') await prisma.technician.update({ where: { id: t.technicianId }, data: { eggBalance: 30 } });
    else await prisma.provider.update({ where: { id: p.providerId }, data: { eggBalance: 30 } });
    const expectedId = kind === 'PROVIDER' ? p.providerId : t.technicianId;
    const name = kind === 'PROVIDER' ? p.name : t.name;
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize({ width, height: 1000 });
    await loginAsAdmin(page);
    await page.goto(`/admin/requests/${req.id}`);
    const candidate = () => page.getByRole('region', { name: '배정 후보', exact: true }).getByRole('listitem').filter({ hasText: name });
    await expect(candidate()).toHaveCount(1);
    await candidate().getByRole('button', { name: '배정', exact: true }).click();
    await page.getByRole('dialog', { name: '배정 확인' }).getByRole('button', { name: '취소', exact: true }).click();
    expect(await prisma.assignment.count({ where: { requestId: req.id } })).toBe(0);
    await candidate().getByRole('button', { name: '배정', exact: true }).click();
    await page.getByRole('dialog', { name: '배정 확인' }).getByRole('button', { name: '배정', exact: true }).click();
    await expect(page.getByRole('button', { name: '배정 회수', exact: true })).toBeVisible();
    const first = await prisma.assignment.findFirstOrThrow({ where: { requestId: req.id } });
    expect(first).toMatchObject({ assignedBy: 'ADMIN', ...(kind === 'PROVIDER' ? { providerId: expectedId } : { technicianId: expectedId }) });
    await page.getByRole('button', { name: '배정 회수', exact: true }).click();
    await page.getByRole('dialog', { name: '배정 회수' }).getByRole('button', { name: '회수', exact: true }).click();
    await expect(candidate()).toBeVisible();
    expect((await prisma.assignment.findUniqueOrThrow({ where: { id: first.id } })).status).toBe('CANCELED');
    await expect(candidate()).toContainText('거절·회수 이력');
    await candidate().getByRole('button', { name: '배정', exact: true }).click();
    await page.getByRole('dialog', { name: '배정 확인' }).getByRole('button', { name: '배정', exact: true }).click();
    await expect(page.getByRole('button', { name: '배정 회수', exact: true })).toBeVisible();
    expect(await prisma.assignment.count({ where: { requestId: req.id } })).toBe(2);
    await page.getByRole('button', { name: '접수 취소', exact: true }).click();
    await page.getByRole('dialog', { name: '접수 취소' }).getByRole('button', { name: '접수 취소', exact: true }).click();
    await expect.poll(async () => (await prisma.serviceRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe('CANCELED');
    expect(await prisma.assignment.count({ where: { requestId: req.id, status: { in: ['REQUESTED', 'ACCEPTED'] } } })).toBe(0);
    expect(errors).toEqual([]);
    const output = resolve(process.env.ASSIGNMENT_AUDIT_OUTPUT ?? 'docs/assignment-audit-2026-09-10/evidence');
    mkdirSync(output, { recursive: true });
    await page.screenshot({ path: resolve(output, `manual-${kind.toLowerCase()}-${width}.png`), fullPage: true });
  });
}
