import { expect, test, type Page } from '@playwright/test';

const artifactsDir = 'artifacts/g001-qa';

async function login(page: Page) {
  await page.goto('/admin/login');
  await page.locator('#loginId').fill('admin');
  await page.locator('#password').fill('admin1234');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

function dashboardFixture(period: string) {
  return {
    operational: {
      byStatus: { RECEIVED: period === 'month' ? 29029 : 70007 },
      needsAttention: 1,
      byUrgencyOpen: { CRITICAL: 1, URGENT: 0, NORMAL: 2 },
    },
    trend: [{ bucket: '2026-07-18', received: period === 'month' ? 29029 : 70007, completed: 1 }],
    performance: {
      op: { firstOfferSec: { mean: 1, median: 1, p90: 1 }, offerAcceptRate: 0.5, accepted: 1, rejected: 1 },
      cust: { acceptSec: { mean: 2, median: 2, p90: 2 }, requestSuccessRate: 0.5, requestsWithAccepted: 1, totalRequests: 2 },
    },
    money: { surveyPaid: { sum: 1000, count: 1, avg: 1000 }, commission: { PENDING: 100, PAID: 900 } },
    updatedAt: '2026-07-18T00:00:00.000Z',
  };
}

test.describe('G001 관리자 분석 레드팀', () => {
  test('비인증 API 접근과 쓰기 메서드를 거부한다', async ({ page }) => {
    for (const endpoint of ['/api/admin/analytics/summary', '/api/admin/analytics/dashboard']) {
      const response = await page.request.fetch(endpoint);
      expect([401, 403]).toContain(response.status());
    }

    for (const endpoint of ['/api/admin/analytics/summary', '/api/admin/analytics/dashboard']) {
      for (const method of ['POST', 'PUT', 'DELETE'] as const) {
        const response = await page.request.fetch(endpoint, { method });
        expect([404, 405]).toContain(response.status());
      }
    }
  });

  test('dashboard period 경계 입력은 500 없이 거부하거나 안전하게 기본화한다', async ({ page }) => {
    await login(page);
    for (const suffix of ['?period=year', "?period=';DROP%20TABLE", '?period=', '?period=week&period=month']) {
      const response = await page.request.fetch(`/api/admin/analytics/dashboard${suffix}`);
      expect(response.status()).not.toBe(500);
      expect([200, 400]).toContain(response.status());
      if (response.status() === 200) {
        const body = await response.json();
        expect(body).toEqual(expect.objectContaining({ operational: expect.any(Object), updatedAt: expect.any(String) }));
      }
    }
  });

  test('인증 API 응답은 계약 스키마만 제공하고 수수료 상태를 분리한다', async ({ page }) => {
    await login(page);
    const summary = await page.request.get('/api/admin/analytics/summary');
    expect(summary.status()).toBe(200);
    expect(Object.keys(await summary.json()).sort()).toEqual(['needsAttention', 'received', 'updatedAt', 'urgentOpen']);

    const dashboard = await page.request.get('/api/admin/analytics/dashboard?period=week');
    expect(dashboard.status()).toBe(200);
    const body = await dashboard.json();
    expect(Object.keys(body).sort()).toEqual(['money', 'operational', 'performance', 'trend', 'updatedAt']);
    expect(Object.keys(body.money.commission).sort()).toEqual(['PAID', 'PENDING']);
    for (const forbidden of ['total', 'sum', 'aggregate', 'combined']) expect(body).not.toHaveProperty(forbidden);
  });

  test('dashboard 500은 오류를 표시하고 앱을 크래시하지 않는다', async ({ page }) => {
    await page.route('**/api/admin/analytics/dashboard?period=week', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'redteam failure' }) }));
    await login(page);
    await page.goto('/admin/analytics/dashboard');
    await expect(page.getByText(/redteam failure|분석 데이터를 불러오는 중/)).toBeVisible();
    await expect(page.getByRole('heading', { name: '분석 현황' })).toBeVisible();
  });

  test('summary 500에도 관리 큐는 정상 동작한다', async ({ page }) => {
    await page.route('**/api/admin/analytics/summary', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'summary failure' }) }));
    await login(page);
    await expect(page.locator('table tbody tr').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '배정 대기 탭으로 이동' })).toBeVisible();
  });

  test('빠른 기간 전환은 늦은 이전 응답을 새 탭에 표시하지 않는다', async ({ page }) => {
    let releaseWeek!: () => void;
    const weekHeld = new Promise<void>((resolve) => { releaseWeek = resolve; });
    let sawWeek!: () => void;
    const weekSeen = new Promise<void>((resolve) => { sawWeek = resolve; });
    await page.route('**/api/admin/analytics/dashboard?period=*', async (route) => {
      const period = new URL(route.request().url()).searchParams.get('period')!;
      if (period === 'week') {
        sawWeek();
        await weekHeld;
      }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(dashboardFixture(period)) });
    });
    await login(page);
    await page.goto('/admin/analytics/dashboard', { waitUntil: 'domcontentloaded' });
    await weekSeen;
    await page.getByLabel('분석 기간').getByRole('button', { name: '월', exact: true }).click();
    await expect(page.getByLabel('분석 기간').getByRole('button', { name: '월', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('운영 상태 분포').getByText('29029', { exact: true })).toBeVisible();
    releaseWeek();
    await page.waitForTimeout(200);
    await expect(page.getByLabel('운영 상태 분포').getByText('70007', { exact: true })).toHaveCount(0);
  });

  test('1023px에서는 분석 요청이 없고 1024px에서는 summary와 dashboard가 요청된다', async ({ browser }) => {
    const narrow = await browser.newPage({ viewport: { width: 1023, height: 800 } });
    let narrowSummary = 0;
    let narrowDashboard = 0;
    narrow.on('request', (request) => {
      if (request.url().includes('/api/admin/analytics/summary')) narrowSummary += 1;
      if (request.url().includes('/api/admin/analytics/dashboard')) narrowDashboard += 1;
    });
    await login(narrow);
    await narrow.goto('/admin/analytics/dashboard');
    await narrow.waitForTimeout(250);
    expect(narrowSummary).toBe(0);
    expect(narrowDashboard).toBe(0);
    await narrow.close();

    const wide = await browser.newPage({ viewport: { width: 1024, height: 800 } });
    let wideSummary = 0;
    let wideDashboard = 0;
    wide.on('request', (request) => {
      if (request.url().includes('/api/admin/analytics/summary')) wideSummary += 1;
      if (request.url().includes('/api/admin/analytics/dashboard')) wideDashboard += 1;
    });
    await login(wide);
    await expect.poll(() => wideSummary, { timeout: 3_000 }).toBeGreaterThan(0);
    await wide.goto('/admin/analytics/dashboard');
    await expect.poll(() => wideDashboard, { timeout: 3_000 }).toBeGreaterThan(0);
    await wide.close();
  });

  test('실제 로그인 화면 증거를 저장한다', async ({ page }) => {
    await login(page);
    await expect(page.getByText('오늘 접수', { exact: true })).toBeVisible();
    await page.screenshot({ path: `${artifactsDir}/strip.png`, fullPage: false });
    await page.goto('/admin/analytics/dashboard');
    await expect(page.getByRole('heading', { name: '분석 현황' })).toBeVisible();
    await expect(page.getByText('운영 상태', { exact: true })).toBeVisible();
    await page.screenshot({ path: `${artifactsDir}/dashboard.png`, fullPage: true });
  });
});
