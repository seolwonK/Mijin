import { expect, test, type Page } from '@playwright/test';

const ranking = {
  ranking: [
    { subjectKey: 'PROVIDER:p1', name: '가 업체', type: 'PROVIDER', avgRating: 4.5, reviewCount: 12, completed: 20 },
    { subjectKey: 'TECHNICIAN:t1', name: '나 기술자', type: 'TECHNICIAN', avgRating: 3.5, reviewCount: 2, completed: 4 },
  ],
};

async function login(page: Page) {
  await page.goto('/admin/login');
  await page.locator('#loginId').fill('admin');
  await page.locator('#password').fill('admin1234');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

async function mockRatings(page: Page) {
  let requestCount = 0;
  await page.route('**/api/admin/analytics/ratings**', async (route) => {
    requestCount += 1;
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET') return route.fulfill({ status: 405 });
    if (url.pathname.endsWith('/PROVIDER%3Ainvalid') || url.pathname.endsWith('/PROVIDER:invalid')) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: '잘못된 subject' }) });
    if (url.pathname.endsWith('/PROVIDER%3Ap1') || url.pathname.endsWith('/PROVIDER:p1')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ monthly: [{ bucket: '2026-07', avgRating: 4.5, reviewCount: 12 }], reviews: { items: [{ rating: 5, comment: '친절합니다', submittedAt: '2026-07-18T00:00:00.000Z' }], total: 3, hasNext: true, nextCursor: 'review-1' } }) });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(ranking) });
  });
  return () => requestCount;
}

test.describe('관리자 평점 현황', () => {
  test('does not request ratings data below the lg breakpoint', async ({ page }) => {
    await page.setViewportSize({ width: 1023, height: 800 });
    await login(page);
    const requestCount = await mockRatings(page);
    await page.goto('/admin/analytics/ratings');

    await expect(page.getByText('평점 현황은 데스크톱에서 이용할 수 있습니다.')).toBeVisible();
    expect(requestCount()).toBe(0);
  });
  test('sorts, filters, and loads a selected subject detail through GET', async ({ page }) => {
    await login(page);
    await mockRatings(page);
    await page.goto('/admin/analytics/ratings');
    await expect(page.getByText('가 업체')).toBeVisible();
    await page.getByRole('button', { name: /응답 수/ }).click();
    await expect(page.locator('tbody tr').first()).toContainText('나 기술자');
    await page.getByRole('button', { name: /평균 별점/ }).click();
    await page.getByLabel('이름 검색').fill('나 기술자');
    await expect(page.getByText('가 업체')).toHaveCount(0);
    await page.getByLabel('이름 검색').fill('가 업체');
    const detailRequest = page.waitForRequest((request) => request.url().includes('/api/admin/analytics/ratings/PROVIDER%3Ap1') && request.method() === 'GET');
    await page.getByRole('button', { name: /가 업체/ }).click();
    await detailRequest;
    await expect(page.getByRole('img', { name: '월별 별점 추이' })).toBeVisible();
    await expect(page.getByText('친절합니다')).toBeVisible();
    await expect(page.getByRole('button', { name: '더보기 (외 2건)' })).toBeVisible();
  });

  test('loads the next bounded review page and formats rating chart values in points', async ({ page }) => {
    await login(page);
    const firstPage = Array.from({ length: 30 }, (_, index) => ({ rating: 5, comment: `후기 ${index + 1}`, submittedAt: `2026-07-${String(30 - index).padStart(2, '0')}T00:00:00.000Z` }));
    const nextPage = [{ rating: 4, comment: '후기 31', submittedAt: '2026-06-30T00:00:00.000Z' }];
    await page.route('**/api/admin/analytics/ratings**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/PROVIDER%3Ap1') || url.pathname.endsWith('/PROVIDER:p1')) {
        const reviews = url.searchParams.get('cursor') === 'review-30'
          ? { items: nextPage, total: 31, hasNext: false, nextCursor: null }
          : { items: firstPage, total: 31, hasNext: true, nextCursor: 'review-30' };
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ monthly: [{ bucket: '2026-07', avgRating: 4.5, reviewCount: 31 }], reviews }) });
      }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(ranking) });
    });

    await page.goto('/admin/analytics/ratings');
    await page.getByRole('button', { name: /가 업체/ }).click();
    await expect(page.getByText('후기 30')).toBeVisible();
    await page.getByRole('img', { name: '월별 별점 추이' }).locator('circle').first().hover();
    await expect(page.getByText('4.5점', { exact: true })).toBeVisible();
    const continuationRequest = page.waitForRequest((request) => request.url().includes('cursor=review-30') && request.method() === 'GET');
    await page.getByRole('button', { name: '더보기 (외 1건)' }).click();
    await continuationRequest;
    await expect(page.getByText('후기 31')).toBeVisible();
    await expect(page.getByRole('button', { name: /더보기/ })).toHaveCount(0);
  });
  
  test('실제 API — 잘못된 subject 400, 미존재 404, 쓰기 메서드 거부', async ({ page }) => {
    // page.request 는 route mock을 우회하므로 실제 라우트 계약을 검증한다.
    await login(page);
    const malformed = await page.request.get('/api/admin/analytics/ratings/USER:abc');
    expect(malformed.status()).toBe(400);
    const missing = await page.request.get('/api/admin/analytics/ratings/PROVIDER:nonexistent');
    expect(missing.status()).toBe(404);
    const write = await page.request.post('/api/admin/analytics/ratings');
    expect(write.status()).toBe(405);
  });

  test('대상 전환 시 이전 대상의 상세가 남지 않는다 (역순 응답 격리)', async ({ page }) => {
    await login(page);
    await page.route('**/api/admin/analytics/ratings**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.includes('PROVIDER%3Ap1') || url.pathname.includes('PROVIDER:p1')) {
        // A(가 업체) 상세는 늦게 도착 — B 선택 후 완료되는 역순 응답
        await new Promise((resolve) => setTimeout(resolve, 700));
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ monthly: [], reviews: { items: [{ rating: 1, comment: 'A업체 늦은 후기', submittedAt: '2026-07-18T00:00:00.000Z' }], total: 1, hasNext: false } }) });
      }
      if (url.pathname.includes('TECHNICIAN%3At1') || url.pathname.includes('TECHNICIAN:t1')) {
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ monthly: [], reviews: { items: [{ rating: 4, comment: 'B기술자 후기', submittedAt: '2026-07-18T00:00:00.000Z' }], total: 1, hasNext: false } }) });
      }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(ranking) });
    });
    await page.goto('/admin/analytics/ratings');
    await page.getByRole('button', { name: /가 업체/ }).click();
    await page.getByRole('button', { name: /나 기술자/ }).click();
    await expect(page.getByText('B기술자 후기')).toBeVisible();
    // A의 늦은 응답이 도착한 뒤에도 B 아래에 A 상세가 나타나면 안 된다.
    await page.waitForTimeout(1_000);
    await expect(page.getByText('A업체 늦은 후기')).toHaveCount(0);
    await expect(page.getByText('B기술자 후기')).toBeVisible();
  });
});
