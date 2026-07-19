import { expect, test, type Page } from '@playwright/test';

const REGIONS_URL = '/api/admin/analytics/map/regions';
const DISPATCH_URL = '/api/admin/analytics/map/dispatch';

const region = (key: string, demand: number, supply = 1) => ({
  key,
  name: key,
  hasSigungu: key !== '세종특별자치시',
  supply,
  demand,
  pressure: supply ? demand / supply : null,
  state: supply ? (demand ? 'NORMAL' : 'ZERO') : (demand ? 'CRITICAL_ALERT' : 'INACTIVE'),
});

const regionsPayload = (regions = [region('서울특별시', 3)]) => ({
  level: 'sido',
  sido: null,
  regions,
  gapAlerts: [],
  unknownLocation: { count: 2, reasons: { '주소 미상': 2 } },
  sigunguUnknown: 0,
  sourceLabel: '경계 시각화: VWorld 스냅샷 확보 후 제공 예정',
  asOf: '2026-07-18T00:00:00.000Z',
});

const dispatchPayload = {
  pins: [{ requestId: 'req-1', lookupCode: '900001', lat: 37.5, lng: 127.0, address: '서울특별시' }],
  unknownCount: 1,
  asOf: '2026-07-18T00:00:00.000Z',
};

async function login(page: Page) {
  await page.goto('/admin/login');
  await page.locator('#loginId').fill('admin');
  await page.locator('#password').fill('admin1234');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

async function jsonFromPage(page: Page, url: string) {
  return page.evaluate(async (endpoint) => {
    const response = await fetch(endpoint);
    return { status: response.status, body: await response.json() };
  }, url);
}

test.describe('G003 지도 API/UI 레드팀', () => {
  test('비인증 GET은 거부하고 모든 쓰기 메서드는 405다', async ({ request }) => {
    for (const url of [REGIONS_URL, DISPATCH_URL]) {
      const response = await request.get(url);
      expect([401, 403]).toContain(response.status());
      for (const method of ['post', 'put', 'delete'] as const) {
        const writeResponse = await request[method](url);
        expect(writeResponse.status(), `${method.toUpperCase()} ${url}`).toBe(405);
      }
    }
  });

  test('sido 경계값은 500 없이 정직하게 처리한다', async ({ page }) => {
    await login(page);
    for (const sido of ['서울', 'toString', '__proto__', '세종특별자치시']) {
      const result = await jsonFromPage(page, `${REGIONS_URL}?sido=${encodeURIComponent(sido)}`);
      expect(result.status, sido).toBe(400);
    }
    const blank = await jsonFromPage(page, `${REGIONS_URL}?sido=`);
    expect([200, 400]).toContain(blank.status);
    expect(blank.status).not.toBe(500);
  });

  test('인증된 읽기 응답은 읽기 전용 스키마를 정확히 제공한다', async ({ page }) => {
    await login(page);
    const regions = await jsonFromPage(page, REGIONS_URL);
    const dispatch = await jsonFromPage(page, DISPATCH_URL);
    expect(regions.status).toBe(200);
    expect(dispatch.status).toBe(200);

    expect(Object.keys(regions.body).sort()).toEqual(['asOf', 'gapAlerts', 'level', 'regions', 'sido', 'sigunguUnknown', 'sourceLabel', 'unknownLocation']);
    expect(Object.keys(regions.body.unknownLocation).sort()).toEqual(['count', 'reasons']);
    expect(typeof regions.body.sigunguUnknown).toBe('number');
    expect(typeof regions.body.sourceLabel).toBe('string');
    expect(new Date(regions.body.asOf).toString()).not.toBe('Invalid Date');
    for (const row of regions.body.regions) {
      expect(Object.keys(row).sort()).toEqual(['demand', 'hasSigungu', 'key', 'name', 'pressure', 'state', 'supply']);
      expect(row).not.toHaveProperty('id');
      expect(row).not.toHaveProperty('writeUrl');
    }
    for (const alert of regions.body.gapAlerts) expect(Object.keys(alert).sort()).toEqual(['demand', 'key', 'name']);
    expect(Object.keys(dispatch.body).sort()).toEqual(['asOf', 'pins', 'unknownCount']);
    expect(new Date(dispatch.body.asOf).toString()).not.toBe('Invalid Date');
    for (const pin of dispatch.body.pins) {
      expect(Object.keys(pin).sort()).toEqual(['address', 'lat', 'lng', 'lookupCode', 'requestId']);
      expect(pin).not.toHaveProperty('assigneeId');
    }
  });

  test('regions 500이어도 출동 패널은 독립적으로 렌더된다', async ({ page }) => {
    await page.route(`**${REGIONS_URL}`, (route) => route.fulfill({ status: 500, json: { error: 'regions failed' } }));
    await page.route(`**${DISPATCH_URL}`, (route) => route.fulfill({ json: dispatchPayload }));
    await login(page);
    await page.goto('/admin/analytics/map');
    await expect(page.getByText('요청 실패 (500)', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '출동 현황' })).toBeVisible();
    await expect(page.getByText('900001', { exact: true })).toBeVisible();
  });

  test('dispatch 500이어도 지역 표는 독립적으로 렌더된다', async ({ page }) => {
    await page.route(`**${REGIONS_URL}`, (route) => route.fulfill({ json: regionsPayload() }));
    await page.route(`**${DISPATCH_URL}`, (route) => route.fulfill({ status: 500, json: { error: 'dispatch failed' } }));
    await login(page);
    await page.goto('/admin/analytics/map');
    await expect(page.getByText('요청 실패 (500)', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '수급 압력 순위표' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '서울특별시', exact: true })).toBeVisible();
  });

  test('17시도와 10개 갭 경보를 렌더하며 경보 수요 내림차순을 유지한다', async ({ page }) => {
    const regions = Array.from({ length: 17 }, (_, index) => region(`지역${index + 1}`, 17 - index));
    const gapAlerts = Array.from({ length: 10 }, (_, index) => ({ key: `경보${index + 1}`, name: `경보${index + 1}`, demand: 10 - index }));
    await page.route(`**${REGIONS_URL}`, (route) => route.fulfill({ json: { ...regionsPayload(regions), gapAlerts } }));
    await page.route(`**${DISPATCH_URL}`, (route) => route.fulfill({ json: dispatchPayload }));
    await login(page);
    await page.goto('/admin/analytics/map');
    await expect(page.locator('tbody tr')).toHaveCount(18);
    const alertText = await page.locator('[aria-labelledby="gap-alerts-heading"] li').allTextContents();
    expect(alertText).toHaveLength(10);
    expect(alertText.map((text) => Number(text.match(/수요\s(\d+)건/)?.[1]))).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });

  test('경계 미확보 시 안내 배너, 확보 시 코로플레스와 차량 추적 아님 라벨을 표시한다', async ({ page }) => {
    // 미확보(unavailable) 경로 — manifest 404
    await page.route('**/geo/manifest.json', (route) => route.fulfill({ status: 404 }));
    await login(page);
    await page.goto('/admin/analytics/map');
    await expect(page.getByLabel('지도 안내')).toContainText('제공 예정');
    await expect(page.getByText('차량 추적 아님 — 고객 목적지 기준').first()).toBeVisible();
    await page.unroute('**/geo/manifest.json');

    // 확보(loaded) 경로 — 실제 게시 manifest 사용, 배너 없음 + 코로플레스 렌더
    await page.reload();
    await expect(page.getByRole('img', { name: '시도별 수급 압력 지도' }).locator('path')).toHaveCount(17, { timeout: 20_000 });
    await expect(page.getByLabel('지도 안내')).toHaveCount(0);
    await page.screenshot({ path: 'artifacts/g003-qa/map.jpg', type: 'jpeg', quality: 92, fullPage: true });
  });

  test('출동은 8초 폴링하고 지역 집계는 그보다 느린 45초 경계를 지킨다', async ({ page }) => {
    let regionsCalls = 0;
    let dispatchCalls = 0;
    await page.route(`**${REGIONS_URL}`, (route) => {
      regionsCalls += 1;
      return route.fulfill({ json: regionsPayload() });
    });
    await page.route(`**${DISPATCH_URL}`, (route) => {
      dispatchCalls += 1;
      return route.fulfill({ json: dispatchPayload });
    });
    await login(page);
    await page.goto('/admin/analytics/map');
    await expect.poll(() => dispatchCalls).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(8_500);
    expect(dispatchCalls).toBeGreaterThanOrEqual(2);
    expect(regionsCalls).toBe(1);
  });
  test('1023px에서는 지도 API 요청이 없고 1024px에서는 정상 렌더된다', async ({ browser }) => {
    const narrow = await browser.newContext({ viewport: { width: 1023, height: 800 } });
    const narrowPage = await narrow.newPage();
    let mapCalls = 0;
    narrowPage.on('request', (request) => {
      if ([REGIONS_URL, DISPATCH_URL].includes(new URL(request.url()).pathname)) mapCalls += 1;
    });
    await login(narrowPage);
    await narrowPage.goto('/admin/analytics/map');
    await expect(narrowPage.getByText('지도 현황은 데스크톱에서 이용할 수 있습니다.')).toBeVisible();
    await narrowPage.waitForTimeout(300);
    expect(mapCalls).toBe(0);
    await narrow.close();

    const wide = await browser.newContext({ viewport: { width: 1024, height: 800 } });
    const widePage = await wide.newPage();
    await widePage.route(`**${REGIONS_URL}`, (route) => route.fulfill({ json: regionsPayload() }));
    await widePage.route(`**${DISPATCH_URL}`, (route) => route.fulfill({ json: dispatchPayload }));
    await login(widePage);
    await widePage.goto('/admin/analytics/map');
    await expect(widePage.getByRole('heading', { name: '수급 압력 순위표' })).toBeVisible();
    await wide.close();
  });
});
