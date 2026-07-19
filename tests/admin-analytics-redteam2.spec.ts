import { expect, test, type Page } from '@playwright/test';

const artifactsDir = 'artifacts/g002-qa';
const endpoints = [
  '/api/admin/analytics/surveys',
  '/api/admin/analytics/ratings',
  '/api/admin/analytics/ratings/PROVIDER:missing',
];

const ranking = {
  ranking: [
    { subjectKey: 'PROVIDER:a', name: '알파 업체', type: 'PROVIDER', avgRating: 4.9, reviewCount: 9, completed: 12 },
    { subjectKey: 'TECHNICIAN:b', name: '베타 기술자', type: 'TECHNICIAN', avgRating: 4.1, reviewCount: 4, completed: 8 },
  ],
};

async function login(page: Page) {
  await page.goto('/admin/login');
  await page.locator('#loginId').fill('admin');
  await page.locator('#password').fill('admin1234');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

function surveyFixture(itemCount = 1, total = itemCount) {
  return {
    responseRate: 0.5,
    submitted: 25,
    total: 50,
    pending: {
      items: Array.from({ length: itemCount }, (_, index) => ({
        surveyId: `survey-${index}`,
        requestCode: `900${String(index).padStart(3, '0')}`,
        customerName: `고객 ${index}`,
        customerPhone: '01012345678',
        elapsedDays: index + 1,
      })),
      total,
      hasNext: total > itemCount,
    },
    paidStats: { sum: 500000, count: 25, avg: 20000 },
    updatedAt: '2026-07-18T00:00:00.000Z',
  };
}

async function mockRatings(page: Page) {
  await page.route('**/api/admin/analytics/ratings**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/PROVIDER%3Aa') || path.endsWith('/PROVIDER:a')) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return route.fulfill({ json: { monthly: [], reviews: { items: [{ rating: 1, comment: 'A 후기', submittedAt: '2026-07-18T00:00:00.000Z' }], total: 1, hasNext: false } } });
    }
    if (path.endsWith('/TECHNICIAN%3Ab') || path.endsWith('/TECHNICIAN:b')) {
      return route.fulfill({ json: { monthly: [], reviews: { items: [{ rating: 5, comment: 'B 후기', submittedAt: '2026-07-18T00:00:00.000Z' }], total: 1, hasNext: false } } });
    }
    return route.fulfill({ json: ranking });
  });
}

test.describe('G002 설문·평점 레드팀', () => {
  test('비인증 GET과 쓰기 메서드는 모든 분석 라우트에서 거부된다', async ({ page }) => {
    for (const endpoint of endpoints) {
      const response = await page.request.get(endpoint);
      expect([401, 403]).toContain(response.status());
    }

    await login(page);
    for (const endpoint of endpoints) {
      for (const method of ['POST', 'PUT', 'DELETE'] as const) {
        const response = await page.request.fetch(endpoint, { method });
        expect(response.status(), `${method} ${endpoint}`).toBe(405);
      }
    }
  });

  test('subject 경계 입력은 500 없이 안전하게 거부된다', async ({ page }) => {
    await login(page);
    for (const subject of ['USER:x', 'PROVIDER:', 'PROVIDER:%20', 'PROVIDER:..%2F..']) {
      const response = await page.request.get(`/api/admin/analytics/ratings/${subject}`);
      expect(response.status(), subject).not.toBe(500);
      expect([400, 404], subject).toContain(response.status());
    }
  });

  test('실제 인증 API는 AC4/AC5 스키마와 읽기 전용 집계를 지킨다', async ({ page }) => {
    await login(page);
    const surveysResponse = await page.request.get('/api/admin/analytics/surveys');
    expect(surveysResponse.status()).toBe(200);
    const surveys = await surveysResponse.json();
    expect(Object.keys(surveys).sort()).toEqual(['paidStats', 'pending', 'responseRate', 'submitted', 'total', 'updatedAt']);
    expect(Object.keys(surveys.pending).sort()).toEqual(['hasNext', 'items', 'total']);
    expect(Object.keys(surveys.paidStats).sort()).toEqual(['avg', 'count', 'sum']);
    expect(JSON.stringify(surveys)).not.toMatch(/resend|retry|재발송/i);

    const ratingsResponse = await page.request.get('/api/admin/analytics/ratings');
    expect(ratingsResponse.status()).toBe(200);
    const ratings = await ratingsResponse.json();
    expect(Object.keys(ratings).sort()).toEqual(['ranking']);
    for (const row of ratings.ranking) {
      expect(Object.keys(row).sort()).toEqual(['avgRating', 'completed', 'name', 'reviewCount', 'subjectKey', 'type']);
    }
    for (let index = 1; index < ratings.ranking.length; index += 1) {
      const previous = ratings.ranking[index - 1].avgRating;
      const current = ratings.ranking[index].avgRating;
      if (previous != null && current != null) expect(previous).toBeGreaterThanOrEqual(current);
      if (previous == null) expect(current).toBeNull();
    }
  });

  test('surveys와 ratings 500은 오류를 보이고 다른 관리 화면으로 이동할 수 있다', async ({ page }) => {
    await page.route('**/api/admin/analytics/surveys', (route) => route.fulfill({ status: 500, json: { error: 'survey redteam failure' } }));
    await page.route('**/api/admin/analytics/ratings', (route) => route.fulfill({ status: 500, json: { error: 'ratings redteam failure' } }));
    await login(page);
    await page.goto('/admin/analytics/surveys');
    await expect(page.getByText('요청 실패 (500)')).toBeVisible();
    await expect(page.getByRole('heading', { name: '설문 현황' })).toBeVisible();
    await page.goto('/admin/analytics/ratings');
    await expect(page.getByText('요청 실패 (500)')).toBeVisible();
    await expect(page.getByRole('heading', { name: '평점 현황' })).toBeVisible();
    await page.goto('/admin');
    await expect(page.locator('main')).toBeVisible();
  });

  test('큰 미제출 목록은 50개만 렌더하고 나머지 건수를 표시한다', async ({ page }) => {
    await page.route('**/api/admin/analytics/surveys', (route) => route.fulfill({ json: surveyFixture(50, 5000) }));
    await login(page);
    await page.goto('/admin/analytics/surveys');
    await expect(page.locator('tbody tr')).toHaveCount(50);
    await expect(page.getByText('외 4950건', { exact: true })).toBeVisible();
  });

  test('순위표 A↔B 10회 전환 후 최종 B 상세만 남는다', async ({ page }) => {
    await mockRatings(page);
    await login(page);
    await page.goto('/admin/analytics/ratings');
    const a = page.getByRole('button', { name: /알파 업체/ });
    const b = page.getByRole('button', { name: /베타 기술자/ });
    await expect(a).toBeVisible();
    for (let index = 0; index < 5; index += 1) {
      await a.click();
      await b.click();
    }
    await expect(page.getByText('B 후기', { exact: true })).toBeVisible();
    await page.waitForTimeout(300);
    await expect(page.getByText('A 후기', { exact: true })).toHaveCount(0);
    await expect(page.getByText('B 후기', { exact: true })).toBeVisible();
  });

  test('인증된 실데이터 설문과 평점 드릴다운 증거를 저장한다', async ({ page }) => {
    await login(page);
    await page.goto('/admin/analytics/surveys');
    await expect(page.getByRole('heading', { name: '설문 현황' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '응답률' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '미제출 목록' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '결제 통계' })).toBeVisible();
    await page.screenshot({ path: `${artifactsDir}/surveys.png`, fullPage: true });

    await page.goto('/admin/analytics/ratings');
    await expect(page.getByRole('heading', { name: '평점 현황' })).toBeVisible();
    const row = page.locator('table tbody tr').first();
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.getByRole('heading', { name: '평점 상세' })).toBeVisible();
    await expect(page.getByText('후기 전체', { exact: true })).toBeVisible();
    await page.screenshot({ path: `${artifactsDir}/ratings.png`, fullPage: true });
  });
});
