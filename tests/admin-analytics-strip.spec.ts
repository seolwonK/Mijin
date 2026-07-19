import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/admin/login');
  await page.locator('#loginId').fill('admin');
  await page.locator('#password').fill('admin1234');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe('관리자 요약 스트립 · 분석 대시보드', () => {
  test('① 스트립은 단일 렌더이며 summary 값을 개입 신호에 사용한다', async ({ page }) => {
    await page.route('**/api/admin/analytics/summary', (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ received: 7777, needsAttention: 8888, urgentOpen: 9999, updatedAt: new Date().toISOString() }),
    }));
    await login(page);

    await expect(page.getByText('오늘 접수', { exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: '배정 대기 탭으로 이동' })).toContainText('7777');
    await expect(page.getByRole('button', { name: '배정 대기 탭으로 이동' })).toContainText('확인 필요 8888건');
    await expect(page.getByRole('link', { name: /긴급 미완료/ })).toContainText('9999');
    await expect(page.getByRole('link', { name: /분석 보기/ })).toBeVisible();
  });

  test('② summary는 8초 폴링을 계속한다', async ({ page }) => {
    let summaryCalls = 0;
    page.on('request', (request) => {
      if (request.url().includes('/api/admin/analytics/summary')) summaryCalls += 1;
    });
    await login(page);
    await expect.poll(() => summaryCalls, { timeout: 2_000 }).toBeGreaterThan(0);
    const initial = summaryCalls;
    await expect.poll(() => summaryCalls, { timeout: 12_000, intervals: [250, 500, 1_000] }).toBeGreaterThan(initial);
  });

  test('③ 배정 대기 카드는 배정대기 탭으로 전환한다', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: '배정 대기 탭으로 이동' }).click();
    await expect(page.getByRole('button', { name: /^배정대기( \d+)?$/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('④ 긴급 미완료 카드는 운영 상태 긴급도 분포로 딥링크한다', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: /긴급 미완료/ }).click();
    await expect(page).toHaveURL(/\/admin\/analytics\/dashboard#operational$/);
    await expect(page.locator('#operational')).toBeVisible();
  });

  test('⑤ lg 미만(1000px)에서는 summary 요청 없이 기존 큐를 유지한다', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    let summaryCalls = 0;
    page.on('request', (request) => {
      if (request.url().includes('/api/admin/analytics/summary')) summaryCalls += 1;
    });
    await login(page);
    await expect(page.getByText('긴급 미완료', { exact: true })).toBeHidden();
    await expect(page.getByText('분석 보기', { exact: true })).toBeHidden();
    await page.waitForTimeout(250);
    expect(summaryCalls).toBe(0);
    await expect(page.locator('table tbody tr').first()).toBeVisible();
    await expect(page.getByText('오늘 접수', { exact: true })).toBeVisible();
  });

  test('⑥ 대시보드는 4개 섹션, 긴급도 분포와 접근 가능한 산식 툴팁을 제공한다', async ({ page }) => {
    await login(page);
    await page.goto('/admin/analytics/dashboard');

    for (const heading of ['운영 상태', '접수 · 완료 추이', '처리 성능', '돈 흐름']) {
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    }
    await expect(page.locator('#operational').getByText('초긴급', { exact: true })).toBeVisible();
    await expect(page.locator('#operational').getByText('긴급', { exact: true })).toBeVisible();
    await expect(page.locator('#operational').getByText('일반', { exact: true })).toBeVisible();
    await expect(page.getByText('중앙값', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('P90', { exact: true }).first()).toBeVisible();

    const rateCard = page.getByText('응답완료 제안 수락률', { exact: true }).locator('..');
    const tip = rateCard.getByRole('button', { name: '산식 안내' });
    await tip.focus();
    await expect(page.getByRole('tooltip')).toContainText('ACCEPTED/(ACCEPTED+REJECTED)');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await tip.click();
    await expect(page.getByRole('tooltip')).toContainText('응답시각 기준');
  });

  test('⑦ dashboard는 50초 이내 양성 재폴링한다', async ({ page }) => {
    test.setTimeout(60_000);
    let dashboardCalls = 0;
    page.on('request', (request) => {
      if (request.url().includes('/api/admin/analytics/dashboard')) dashboardCalls += 1;
    });
    await login(page);
    await page.goto('/admin/analytics/dashboard');
    await expect.poll(() => dashboardCalls, { timeout: 5_000 }).toBeGreaterThan(0);
    const initial = dashboardCalls;
    await expect.poll(() => dashboardCalls, { timeout: 50_000, intervals: [1_000, 2_000, 5_000] }).toBeGreaterThan(initial);
  });
});
