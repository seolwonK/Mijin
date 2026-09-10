import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';
import { buildMock, SUMMARY_SHAPE } from './helpers/shapes';


test.describe('관리자 요약 스트립 · 분석 대시보드', () => {
  test('① 스트립은 단일 렌더이며 summary 값을 개입 신호에 사용한다', async ({ page }) => {
    await page.route('**/api/admin/analytics/summary', (route) => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(buildMock(SUMMARY_SHAPE, { received: 7777, needsAttention: 8888, urgentOpen: 9999, updatedAt: new Date().toISOString() })),
    }));
    await loginAsAdmin(page);

    await expect(page.getByText('최근 최대 200건', { exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: '배정 대기 탭으로 이동' })).toContainText('7,777');
    await expect(page.getByRole('button', { name: '관리자 확인 접수 보기' })).toContainText('8,888');
    await expect(page.getByRole('link', { name: /긴급 미완료/ })).toContainText('9,999');
    await expect(page.getByRole('link', { name: /분석 보기/ })).toBeVisible();
  });

  test('② summary는 8초 폴링을 계속한다', async ({ page }) => {
    let summaryCalls = 0;
    page.on('request', (request) => {
      if (request.url().includes('/api/admin/analytics/summary')) summaryCalls += 1;
    });
    await loginAsAdmin(page);
    await expect.poll(() => summaryCalls, { timeout: 2_000 }).toBeGreaterThan(0);
    const initial = summaryCalls;
    await expect.poll(() => summaryCalls, { timeout: 12_000, intervals: [250, 500, 1_000] }).toBeGreaterThan(initial);
  });

  test('③ 배정 대기 카드는 배정대기 탭으로 전환한다', async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole('button', { name: '배정 대기 탭으로 이동' }).click();
    await expect(page.getByRole('button', { name: /^배정대기( \d+)?$/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('④ 긴급 미완료 카드는 현재 남은 업무로 딥링크한다', async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole('link', { name: /긴급 미완료/ }).click();
    await expect(page).toHaveURL(/\/admin\/analytics\/dashboard#operational$/);
    await expect(page.locator('#operational')).toBeVisible();
  });

  test('⑤ 작은 화면에서는 조회 범위 요약과 분석 이동을 제공한다', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    let summaryCalls = 0;
    page.on('request', (request) => {
      if (request.url().includes('/api/admin/analytics/summary')) summaryCalls += 1;
    });
    await loginAsAdmin(page);
    await expect(page.getByRole('link', { name: /긴급 미완료/ })).toContainText('조회된 접수 기준');
    await expect(page.getByRole('link', { name: '분석 보기', exact: true })).toBeVisible();
    await page.waitForTimeout(250);
    expect(summaryCalls).toBe(0);
    await expect(page.locator('table tbody tr').first()).toBeVisible();
    await expect(page.getByText('최근 최대 200건', { exact: true })).toBeVisible();
  });

  test('⑥ 현재 업무와 기간 실적을 구분하고 숫자의 집계 기준을 펼쳐 본다', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/analytics/dashboard');
    for (const heading of ['기간별 운영 실적', '일별 접수와 완료', '고객이 신고한 작업 금액']) {
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    }
    await expect(page.locator('#operational')).toContainText('전체 기간');
    await expect(page.locator('#operational')).toContainText('초긴급');
    await expect(page.getByText('P90', { exact:true })).toHaveCount(0);
    await page.getByText('숫자는 어떤 기준으로 집계하나요?', { exact:true }).click();
    await expect(page.getByText('담당자 수락 비율은 선택 기간에 들어온 접수 중 조회 시점까지 수락된 배정이 있는 접수의 비율입니다.')).toBeVisible();
    await expect(page.getByText('고객 신고 금액은 설문 응답일 기준이며, 0원은 포함하고 금액 미입력 설문은 제외합니다.')).toBeVisible();
  });

  test('⑦ dashboard는 50초 이내 양성 재폴링한다', async ({ page }) => {
    test.setTimeout(60_000);
    let dashboardCalls = 0;
    page.on('request', (request) => {
      if (request.url().includes('/api/admin/analytics/dashboard')) dashboardCalls += 1;
    });
    await loginAsAdmin(page);
    await page.goto('/admin/analytics/dashboard');
    await expect.poll(() => dashboardCalls, { timeout: 5_000 }).toBeGreaterThan(0);
    const initial = dashboardCalls;
    await expect.poll(() => dashboardCalls, { timeout: 50_000, intervals: [1_000, 2_000, 5_000] }).toBeGreaterThan(initial);
  });
});
