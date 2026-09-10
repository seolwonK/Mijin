import { test, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { apiContextOptions, seedSession } from '../helpers/auth';
import { FixtureFactory } from '../helpers/fixtures';

const prisma = new PrismaClient();
const fixtures = new FixtureFactory(prisma);
const account = { eggBankName: '테스트 은행', eggBankAccountNumber: '000-000-000000', eggBankAccountHolder: '계좌 테스트 전용' };
const emptyAccount = { eggBankName: null, eggBankAccountNumber: null, eggBankAccountHolder: null };
const chargeInfo = {
  account: { bankName: account.eggBankName, accountNumber: account.eggBankAccountNumber, accountHolder: account.eggBankAccountHolder },
  balance: 16, depositorName: '테스트 업체', packSize: 30, unitPrice: 1000,
};
test.afterAll(async () => { await fixtures.cleanupAll(); await prisma.$disconnect(); });

test('계좌 관리 권한·검증·관리자 화면 저장·양쪽 포털 반영·미등록 상태', async ({ playwright, context, page }) => {
  const admin = await playwright.request.newContext(await apiContextOptions('ADMIN'));
  const anonymous = await playwright.request.newContext(await apiContextOptions(null));
  const p = await fixtures.createPartnerFixture({ approvalStatus: 'APPROVED', isActive: false });
  const t = await fixtures.createTechFixture({ approvalStatus: 'APPROVED', isActive: false });
  const partner = await playwright.request.newContext(await apiContextOptions('PROVIDER', p));
  const tech = await playwright.request.newContext(await apiContextOptions('TECHNICIAN', t));
  const before = await (await admin.get('/api/admin/egg-charge-account')).json();
  const settingsBefore = await prisma.appSettings.findUniqueOrThrow({ where: { id: 1 } });
  try {
    for (const context of [anonymous, partner, tech]) {
      expect((await context.get('/api/admin/egg-charge-account')).status()).toBe(401);
      expect((await context.put('/api/admin/egg-charge-account', { data: account })).status()).toBe(401);
    }
    for (const scope of ['partner', 'tech']) expect((await anonymous.get(`/api/${scope}/eggs/charge`)).status()).toBe(401);
    expect((await partner.get('/api/tech/eggs/charge')).status()).toBe(401);
    expect((await tech.get('/api/partner/eggs/charge')).status()).toBe(401);
    for (const bad of [{ ...account, eggBankName: '' }, { ...account, eggBankAccountNumber: 'not-an-account' }, { eggBankName: '은행' }, { ...account, eggBankAccountHolder: 'x'.repeat(101) }]) {
      expect((await admin.put('/api/admin/egg-charge-account', { data: bad })).status()).toBe(400);
    }
    expect((await admin.put('/api/admin/egg-charge-account', { data: { ...account, eggBankName: ` ${account.eggBankName} ` } })).status()).toBe(200);
    for (const [scope, context] of [['partner', partner], ['tech', tech]] as const) {
      const res = await context.get(`/api/${scope}/eggs/charge`);
      expect(res.status()).toBe(200);
      expect(res.headers()['cache-control']).toContain('no-store');
      const body = await res.json();
      expect(body).toMatchObject({ account: chargeInfo.account, packSize: 30, unitPrice: 1000 });
      expect(Object.keys(body).sort()).toEqual(['account', 'balance', 'depositorName', 'packSize', 'unitPrice']);
    }
    const after = await prisma.appSettings.findUniqueOrThrow({ where: { id: 1 } });
    expect(after.autoAssignEnabled).toBe(settingsBefore.autoAssignEnabled);
    expect(after.employerName).toBe(settingsBefore.employerName);
    await seedSession(context, 'ADMIN');
    await page.goto('/admin/settings');
    await expect(page.getByLabel('은행명', { exact: true })).toHaveValue(account.eggBankName);
    await page.getByLabel('예금주', { exact: true }).fill('관리자 화면 저장 테스트');
    await page.getByRole('button', { name: '계좌 저장', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('입금 계좌가 저장되었습니다. 업체·기사 충전 화면에 적용됩니다.');
    expect(await (await tech.get('/api/tech/eggs/charge')).json()).toMatchObject({ account: { accountHolder: '관리자 화면 저장 테스트' } });
    expect((await admin.put('/api/admin/egg-charge-account', { data: emptyAccount })).status()).toBe(200);
    expect(await (await partner.get('/api/partner/eggs/charge')).json()).toMatchObject({ account: null });
  } finally {
    await prisma.appSettings.update({ where: { id: 1 }, data: before });
    await Promise.all([admin.dispose(), anonymous.dispose(), partner.dispose(), tech.dispose()]);
  }
});

for (const kind of ['PROVIDER', 'TECHNICIAN'] as const) {
  test(`${kind}: 30알 단위 충전과 중복 지급 방지`, async ({ playwright }) => {
    const admin = await playwright.request.newContext(await apiContextOptions('ADMIN'));
    const target = kind === 'PROVIDER'
      ? await fixtures.createPartnerFixture({ isActive: false })
      : await fixtures.createTechFixture({ isActive: false });
    const id = 'providerId' in target ? target.providerId : target.technicianId;
    const fk = kind === 'PROVIDER' ? { providerId: id } : { technicianId: id };
    try {
      const payload = { kind, id, action: 'charge', memo: '테스트 입금 확인', chargeKey: crypto.randomUUID() };
      for (const count of [0, 3, 29, 31, 59, 30.5, 3_000_000_000]) {
        expect((await admin.post('/api/admin/eggs', { data: { ...payload, count } })).status()).toBe(400);
      }
      expect(await prisma.eggLedger.count({ where: fk })).toBe(0);
      const first = await admin.post('/api/admin/eggs', { data: { ...payload, count: 30 } });
      expect(first.status()).toBe(200);
      expect(await first.json()).toMatchObject({ result: 'CHARGED', balance: 30 });
      const duplicate = await admin.post('/api/admin/eggs', { data: { ...payload, count: 30 } });
      expect(await duplicate.json()).toMatchObject({ result: 'ALREADY_CHARGED', balance: 30 });
      const second = await admin.post('/api/admin/eggs', { data: { ...payload, count: 60, chargeKey: crypto.randomUUID() } });
      expect(await second.json()).toMatchObject({ balance: 90 });
      expect(await prisma.eggLedger.count({ where: fk })).toBe(2);
    } finally {
      await prisma.eggLedger.deleteMany({ where: fk });
      await admin.dispose();
    }
  });
}

for (const scope of ['partner', 'tech'] as const) {
  test(`${scope}: 충전 수량·금액·미등록·통신 장애·반응형`, async ({ context, page }) => {
    await seedSession(context, scope === 'partner' ? 'PROVIDER' : 'TECHNICIAN', { userId: 'charge-ui', ...(scope === 'partner' ? { providerId: 'charge-ui' } : { technicianId: 'charge-ui' }) });
    let mode = 'ready';
    await page.route(`**/api/${scope}/eggs/charge`, route => mode === 'error'
      ? route.fulfill({ status: 503, json: {} })
      : route.fulfill({ json: { ...chargeInfo, account: mode === 'empty' ? null : chargeInfo.account } }));
    await page.goto(`/${scope}/eggs/charge`);
    await expect(page.getByRole('heading', { name: '입금 계좌', exact: true })).toBeVisible();
    await expect(page.getByText('30,000원', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '2판 · 60알' }).click();
    await expect(page.getByText('60,000원', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '1판 늘리기' }).click();
    await expect(page.getByText('90,000원', { exact: true })).toBeVisible();
    await page.getByLabel('충전할 알 개수').fill('31');
    await expect(page.getByLabel('충전할 알 개수')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('수량을 확인해 주세요')).toBeVisible();
    await page.getByRole('button', { name: '1판 · 30알' }).click();
    await expect(page.getByRole('button', { name: '1판 줄이기' })).toBeDisabled();
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    mode = 'error';
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByText('충전 설정을 불러오지 못했습니다')).toBeVisible();
    await expect(page.getByText(account.eggBankAccountNumber)).toHaveCount(0);
    mode = 'empty';
    await page.getByRole('button', { name: '다시 시도' }).click();
    await expect(page.getByRole('heading', { name: '충전 계좌를 준비 중입니다' })).toBeVisible();
  });
}
