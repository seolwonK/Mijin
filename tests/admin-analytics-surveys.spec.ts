import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';
import { buildMock, SURVEYS_SHAPE } from './helpers/shapes';


// 목 본문은 shapes.ts 상수에서 생성한다 — 같은 상수를 Layer 1 이 실응답에 대해
// 단언하므로 목과 실API의 드리프트가 구조적으로 불가능해진다.
const surveyOverview = buildMock(SURVEYS_SHAPE, {
  responseRate: 0.625,
  submitted: 5,
  total: 8,
  pending: {
    items: [{
      surveyId: 'pending-survey',
      requestCode: 'SURVEY-001',
      customerName: '설문 고객',
      customerPhone: '01012345678',
      elapsedDays: 7,
    }],
    total: 3,
    hasNext: true,
  },
  paidStats: { sum: 123456, count: 4, avg: 30864 },
  updatedAt: '2026-07-18T12:00:00.000Z',
});

test.describe('관리자 설문 현황', () => {
  test('① 설문 메뉴에서 3개 영역과 미제출 연락처를 조회 전용으로 표시한다', async ({ page }) => {
    await page.route('**/api/admin/analytics/surveys', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(surveyOverview) });
        return;
      }
      await route.continue();
    });
    await loginAsAdmin(page);
    await page.getByRole('navigation', { name: '관리자 이동' }).getByRole('button', { name: '분석' }).click();
    await page.getByRole('menuitem', { name: '설문', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/analytics\/surveys$/);

    for (const heading of ['응답률', '미제출 목록', '결제 통계']) {
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    }
    await expect(page.getByText('62.5%', { exact: true })).toBeVisible();
    await expect(page.getByText('SURVEY-001', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '01012345678', exact: true })).toHaveAttribute('href', 'tel:01012345678');
    await expect(page.getByText('7일', { exact: true })).toBeVisible();
    await expect(page.getByText('외 2건', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /재발송/ })).toHaveCount(0);
  });

  test('② 설문 API는 인증된 GET만 허용한다', async ({ page, request }) => {
    const anonymousResponse = await request.get('/api/admin/analytics/surveys');
    expect(anonymousResponse.status()).toBe(401);

    await loginAsAdmin(page);
    const getResponse = await page.request.get('/api/admin/analytics/surveys');
    expect(getResponse.status()).toBe(200);

    const postResponse = await page.request.post('/api/admin/analytics/surveys');
    expect(postResponse.status()).toBe(405);
  });

  test('③ 1023px에서는 설문 API를 요청하지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 1023, height: 800 });
    const surveyRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/admin/analytics/surveys') {
        surveyRequests.push(request.method());
      }
    });

    await loginAsAdmin(page);
    // 1023px에서는 분석 내비 그룹 자체가 숨겨지므로(lg 게이트) URL로 직접 진입한다.
    await page.goto('/admin/analytics/surveys');
    await expect(page.getByText('설문 현황은 데스크톱에서 이용할 수 있습니다.', { exact: true })).toBeVisible();
    expect(surveyRequests).toHaveLength(0);
  });
});
