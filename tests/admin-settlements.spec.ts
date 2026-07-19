import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

async function login(page: Page) {
  await page.goto('/admin/login');
  await page.locator('#loginId').fill('admin');
  await page.locator('#password').fill('admin1234');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

function settlementSection(page: Page, title: '업체' | '기술자') {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}

test.describe('관리자 정산 집계 리포트', () => {
  test('AUTH RED-TEAM: unauthenticated API request is rejected', async ({ browser }) => {
    const context = await browser.newContext();
    const response = await context.request.get('/api/admin/settlements');

    expect(response.status()).toBe(401);
    await context.close();
  });

  test('NAV+RENDER: admin can reach the report and see its reference-value warning', async ({ page }) => {
    await login(page);
    const settlementLink = page.getByRole('link', { name: '정산 집계', exact: true });
    if (await settlementLink.count()) {
      await settlementLink.click();
    } else {
      await page.goto('/admin/settlements');
    }

    await expect(page.getByRole('heading', { name: '정산 집계 리포트', exact: true })).toBeVisible();
    await expect(page.getByText(/고객 신고 총수금액 참고치|세무\/회계 확정치가 아닙니다/)).toBeVisible();
  });

  test('POPULATED 업체 TABLE: current month renders the seeded provider aggregate', async ({ browser }) => {
    // 2x 디바이스 스케일 전체 페이지를 JPEG로 캡처 — 내비·필터·캡션·업체/기술자 섹션 전부 포함한 실제 렌더 증거.
    const context = await browser.newContext({ deviceScaleFactor: 2 });
    const page = await context.newPage();
    await login(page);
    await page.goto('/admin/settlements');

    const providers = settlementSection(page, '업체');
    await expect(providers).toContainText('2,500,000원');
    await expect(providers).toContainText('2건');
    await page.screenshot({ path: 'artifacts/g-settlement-qa/settlements.jpg', type: 'jpeg', quality: 92, fullPage: true });
    await context.close();
  });

  test('SEPARATION: technician paid data is not merged into the provider section', async ({ page }) => {
    await login(page);
    await page.goto('/admin/settlements');

    await expect(settlementSection(page, '기술자')).toContainText('해당 기간 집계 데이터 없음');
  });

  test('CSV: source-level export is complete and has the expected content type', async ({ page }) => {
    await login(page);
    const response = await page.request.get('/api/admin/settlements?month=2026-07&format=csv');
    const body = await response.text();
    const lines = body.trim().split(/\r?\n/);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/csv');
    expect(lines).toHaveLength(3);
    expect(lines[0].replace(/^\uFEFF/, '')).toContain('고객신고금액(원)');
    expect(body).toContain('500000');
    expect(body).toContain('2000000');
  });

  test('EMPTY MONTH RED-TEAM: a month without data empties both distinct sections', async ({ page }) => {
    await login(page);
    await page.goto('/admin/settlements');
    const month = page.locator('input[type=month]');
    await month.fill('2020-01');

    await expect(settlementSection(page, '업체')).toContainText('해당 기간 집계 데이터 없음');
    await expect(settlementSection(page, '기술자')).toContainText('해당 기간 집계 데이터 없음');
  });

  test('INJECTION/GARBAGE MONTH RED-TEAM: invalid month safely falls back to KST current month', async ({ page }) => {
    await login(page);
    const response = await page.request.get('/api/admin/settlements?month=not-a-month');

    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ month: '2026-07' });
  });
  test('TRANSCRIPT: record a structured web automation transcript', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const actions: Array<Record<string, unknown>> = [];
    const assertions: Array<Record<string, unknown>> = [];

    await page.goto('/admin/login');
    actions.push({ type: 'goto', url: '/admin/login', selector: '#loginId', timestamp: Date.now() });
    await page.locator('#loginId').fill('admin');
    actions.push({ type: 'fill', selector: '#loginId', value: 'admin', timestamp: Date.now() });
    await page.locator('#password').fill('admin1234');
    actions.push({ type: 'fill', selector: '#password', timestamp: Date.now() });
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    actions.push({ type: 'click', selector: "role=button[name='로그인']", timestamp: Date.now() });
    await expect(page).toHaveURL(/\/admin$/);

    await page.goto('/admin/settlements');
    actions.push({ type: 'goto', url: '/admin/settlements', selector: 'main', timestamp: Date.now() });

    await expect(settlementSection(page, '업체')).toContainText('2,500,000원');
    assertions.push({ type: 'toContainText', selector: "section:has(h2:text-is('업체'))", expected: '2,500,000원', status: 'passed', timestamp: Date.now() });
    await expect(settlementSection(page, '기술자')).toContainText('해당 기간 집계 데이터 없음');
    assertions.push({ type: 'toContainText', selector: "section:has(h2:text-is('기술자'))", expected: '해당 기간 집계 데이터 없음', status: 'passed', timestamp: Date.now() });

    mkdirSync('artifacts/g-settlement-qa', { recursive: true });
    writeFileSync(
      'artifacts/g-settlement-qa/automation-transcript.json',
      JSON.stringify({ schemaVersion: 1, surface: 'web', tool: 'playwright', capturedAt: new Date().toISOString(), actions, assertions }, null, 2),
    );
    await context.close();
  });
});
