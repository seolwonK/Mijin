import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { apiContextOptions } from '../helpers/auth';
import { FixtureFactory } from '../helpers/fixtures';
import { ipHeaders } from '../helpers/ip';

const prisma = new PrismaClient();
const fixtures = new FixtureFactory(prisma);

test.beforeAll(() => {
  // 완료 처리 API의 문자 훅까지 테스트하므로 실발송 제공자에서는 실행하지 않는다.
  expect(process.env.SMS_PROVIDER, '실제 문자 발송 없이 실행해야 합니다').toBe('console');
});
test.afterAll(async () => { await fixtures.cleanupAll(); await prisma.$disconnect(); });

for (const scope of ['partner', 'tech'] as const) {
  test(`${scope}: 완료 → 문자 본문의 링크 → 비로그인 제출 → 재제출 방지`, async ({ playwright, page }) => {
    const actor = scope === 'partner'
      ? await fixtures.createPartnerFixture({ approvalStatus: 'APPROVED', isActive: false })
      : await fixtures.createTechFixture({ approvalStatus: 'APPROVED', isActive: false, contractStatus: 'CONFIRMED' });
    const assignee = 'providerId' in actor ? { providerId: actor.providerId } : { technicianId: actor.technicianId };
    const request = await fixtures.createRequestFixture({ status: 'DISPATCHED' });
    const assignment = await prisma.assignment.create({ data: { requestId: request.id, ...assignee, status: 'ACCEPTED', assignedBy: 'ADMIN' } });
    const worker = await playwright.request.newContext(await apiContextOptions(scope === 'partner' ? 'PROVIDER' : 'TECHNICIAN', actor));
    const guest = await playwright.request.newContext(await apiContextOptions(null, {}, ipHeaders(`survey-lifecycle-${request.id}`)));
    try {
      expect((await worker.post(`/api/${scope}/jobs/${assignment.id}/status`, { data: { status: 'COMPLETED' } })).status()).toBe(200);
      await expect.poll(async () => prisma.smsLog.count({ where: { requestId: request.id, body: { contains: '/survey/' } } })).toBe(1);
      const sms = await prisma.smsLog.findFirstOrThrow({ where: { requestId: request.id, body: { contains: '/survey/' } } });
      expect(sms).toMatchObject({ provider: 'console', status: 'SENT' });
      const url = sms.body.match(/https?:\/\/\S+\/survey\/[A-Za-z0-9_-]+/)?.[0];
      expect(url).toBeTruthy();
      expect(new URL(url!).origin).toBe(new URL(process.env.APP_BASE_URL || process.env.E2E_BASE_URL || 'http://localhost:3000').origin);
      const survey = await prisma.satisfactionSurvey.findUniqueOrThrow({ where: { requestId: request.id } });
      expect(new URL(url!).pathname).toBe(`/survey/${survey.token}`);
      const lookupBefore = await (await guest.post('/api/requests/lookup', { data: { phone: request.customerPhone } })).json();
      expect(lookupBefore.requests.find((r: { id: string }) => r.id === request.id).survey.url).toBe(`/survey/${survey.token}`);

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(url!);
      await expect(page.getByRole('heading', { name: '수리는 어떠셨나요?' })).toBeVisible();
      await page.getByRole('button', { name: '제출하기', exact: true }).click();
      await expect(page.getByRole('alert').filter({ hasText: '별점을 선택해 주세요' })).toBeVisible();
      await page.getByRole('button', { name: '5점', exact: true }).click();
      await page.getByPlaceholder('수리 과정에 대한 의견을 남겨 주세요').fill('내부 검증: 수리와 안내가 좋았습니다.');
      await page.getByPlaceholder('0', { exact: true }).fill('150000');
      await expect(page.getByPlaceholder('0', { exact: true })).toHaveValue('150,000');
      await page.getByRole('button', { name: '제출하기', exact: true }).click();
      await expect(page.getByRole('heading', { name: '참여 완료', exact: true })).toBeVisible();
      const saved = await prisma.satisfactionSurvey.findUniqueOrThrow({ where: { id: survey.id } });
      expect(saved).toMatchObject({ rating: 5, paidAmount: 150000, comment: '내부 검증: 수리와 안내가 좋았습니다.' });
      expect(saved.submittedAt).not.toBeNull();
      await page.reload();
      await expect(page.getByRole('heading', { name: '참여 완료', exact: true })).toBeVisible();
      expect((await guest.post(`/api/survey/${survey.token}`, { data: { rating: 1, paidAmount: 1 } })).status()).toBe(409);
      const lookupAfter = await (await guest.post('/api/requests/lookup', { data: { phone: request.customerPhone } })).json();
      expect(lookupAfter.requests.find((r: { id: string }) => r.id === request.id).survey).not.toHaveProperty('url');
      expect((await worker.post(`/api/${scope}/jobs/${assignment.id}/status`, { data: { status: 'COMPLETED' } })).status()).toBe(409);
      expect(await prisma.satisfactionSurvey.count({ where: { requestId: request.id } })).toBe(1);
    } finally { await worker.dispose(); await guest.dispose(); }
  });
}

test('잘못된 링크와 조회 장애를 구분하고 장애 시 다시 시도할 수 있다', async ({ page }) => {
  await page.goto('/survey/internal-test-missing-token');
  await expect(page.getByRole('heading', { name: '설문을 찾을 수 없습니다' })).toBeVisible();
  let failed = true;
  await page.route('**/api/survey/internal-ui-retry', route => failed
    ? route.fulfill({ status: 503, json: {} })
    : route.fulfill({ json: { submitted: false, completedAt: new Date().toISOString() } }));
  await page.goto('/survey/internal-ui-retry');
  await expect(page.getByText('정보를 불러오지 못했습니다.', { exact: true })).toBeVisible();
  failed = false;
  await page.getByRole('button', { name: '다시 시도' }).click();
  await expect(page.getByRole('heading', { name: '수리는 어떠셨나요?' })).toBeVisible();
});
