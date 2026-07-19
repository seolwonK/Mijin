import { expect, test, type Page } from '@playwright/test';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';

const REGIONS_URL = '/api/admin/analytics/map/regions';
const DISPATCH_URL = '/api/admin/analytics/map/dispatch';
const RESULTS_PATH = 'artifacts/g005-qa/redteam4-results.txt';

async function login(page: Page) {
  await page.goto('/admin/login');
  await page.locator('#loginId').fill('admin');
  await page.locator('#password').fill('admin1234');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

async function openMap(page: Page) {
  await login(page);
  await page.goto('/admin/analytics/map');
  await expect(page.getByRole('heading', { name: '전국 지도 현황' })).toBeVisible();
}

test.beforeAll(async () => {
  await mkdir('artifacts/g005-qa', { recursive: true });
  await writeFile(RESULTS_PATH, 'G005 admin analytics map redteam4\n');
});

test.afterEach(async ({}, testInfo) => {
  await appendFile(RESULTS_PATH, `${testInfo.status?.toUpperCase() ?? 'UNKNOWN'} ${testInfo.title}\n`);
});

test.describe('G005 코로플레스·경계 파이프라인 레드팀', () => {
  test('실제 경계 manifest·파일은 200, 시도 17 및 광주·전남 분리, 시군구 파티션 합계를 제공한다', async ({ request }) => {
    const manifestResponse = await request.get('/geo/manifest.json');
    expect(manifestResponse.status()).toBe(200);
    const manifest = await manifestResponse.json();
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.sido.featureCount).toBe(17);

    const sidoResponse = await request.get(`/geo/${manifest.sido.file}`);
    expect(sidoResponse.status()).toBe(200);
    const sido = await sidoResponse.json();
    expect(sido.features).toHaveLength(17);
    for (const feature of sido.features) {
      expect(feature.properties.regionKey).toEqual(expect.any(String));
      expect(feature.properties.regionKey).not.toBe('');
    }
    const sidoNames = new Set(sido.features.map((feature: { properties: { name: string } }) => feature.properties.name));
    expect(sidoNames).toContain('광주광역시');
    expect(sidoNames).toContain('전라남도');

    // 시군구는 시도별 분할 파티션 — manifest 합계와 대표 파티션(서울) 실파일 검증
    const partitions = Object.entries(manifest.sigungu) as Array<[string, { file: string; featureCount: number }]>;
    expect(partitions.length).toBe(17);
    const total = partitions.reduce((sum, [, entry]) => sum + entry.featureCount, 0);
    expect(total).toBeGreaterThanOrEqual(200);
    const seoul = partitions.find(([name]) => name === '서울특별시');
    expect(seoul).toBeTruthy();
    const seoulResponse = await request.get(`/geo/${seoul![1].file}`);
    expect(seoulResponse.status()).toBe(200);
    const seoulGeo = await seoulResponse.json();
    expect(seoulGeo.features).toHaveLength(seoul![1].featureCount);
  });

  test('실화면에서 17개 시도 path, 시군구 드릴다운·시도 복귀와 출처·기준일을 렌더한다', async ({ page }) => {
    await openMap(page);
    const map = page.getByRole('img', { name: '시도별 수급 압력 지도' });
    await expect(map.locator('path')).toHaveCount(17, { timeout: 20_000 });
    await expect(page.getByText(/공공누리 제1유형[^]*기준일 \d{4}-\d{2}-\d{2}/)).toBeVisible();

    const selectable = map.locator('path[tabindex="0"]');
    await expect(selectable.first()).toBeVisible();
    await selectable.first().click({ force: true });
    await expect(page).toHaveURL(/\/admin\/analytics\/map\?sido=/);
    const drilldownMap = page.getByRole('img', { name: /시군구별 수급 압력 지도/ });
    await expect(drilldownMap).toBeVisible();
    expect(await drilldownMap.locator('path').count()).toBeGreaterThan(0);
    await page.screenshot({ path: 'artifacts/g005-qa/choropleth-drill.jpg', type: 'jpeg', quality: 92, fullPage: true });
    await page.getByRole('button', { name: '시도 보기', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/analytics\/map$/);
    await expect(page.getByRole('img', { name: '시도별 수급 압력 지도' }).locator('path')).toHaveCount(17);
  });

  test('geojson 404는 순위표와 안내 배너를 유지하고 크래시하지 않는다', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));
    // 데이터 파일 손실(manifest는 정상) = corrupt 상태 — 정직한 오류 배너 + 순위표 유지 (계약 v2)
    await page.route('**/geo/kr-sido.*.geo.json', (route) => route.fulfill({ status: 404 }));
    await openMap(page);
    await expect(page.locator('section[role="alert"]')).toContainText('경계 데이터를 불러오지 못했습니다');
    await expect(page.getByRole('heading', { name: '수급 압력 순위표' })).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('빈 features와 비JSON geojson은 안전 폴백하고 500 없이 UI를 유지한다', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));
    await page.route('**/geo/kr-sido.*.geo.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features: [] }) }));
    await openMap(page);
    await expect(page.locator('section[role="alert"]')).toContainText('경계 데이터를 불러오지 못했습니다');
    await expect(page.getByRole('heading', { name: '수급 압력 순위표' })).toBeVisible();
    expect(pageErrors).toEqual([]);

    await page.unroute('**/geo/kr-sido.*.geo.json');
    await page.route('**/geo/kr-sido.*.geo.json', (route) => route.fulfill({ contentType: 'application/json', body: '{broken' }));
    await page.reload();
    await expect(page.locator('section[role="alert"]')).toContainText('경계 데이터를 불러오지 못했습니다');
    await expect(page.getByRole('heading', { name: '수급 압력 순위표' })).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('실API는 좌표 전용 접수의 경계 미탑재 사유를 관찰하고 500 없이 응답한다', async ({ page }) => {
    await login(page);
    const result = await page.evaluate(async (url) => {
      const response = await fetch(url);
      return { status: response.status, body: await response.json() };
    }, REGIONS_URL);
    expect(result.status).toBe(200);
    const reasons = result.body.unknownLocation.reasons as Record<string, number>;
    expect(reasons['경계 데이터 미탑재'] ?? 0).toBe(0);
    await appendFile(RESULTS_PATH, `OBSERVED unknown reasons: ${JSON.stringify(reasons)}\n`);
  });

  test('1023px는 map API 요청 0건, API는 GET 전용, dispatch는 8초 재폴링한다', async ({ browser, page }) => {
    const narrow = await browser.newContext({ viewport: { width: 1023, height: 800 } });
    const narrowPage = await narrow.newPage();
    const calls: string[] = [];
    narrowPage.on('request', (request) => {
      if ([REGIONS_URL, DISPATCH_URL].includes(new URL(request.url()).pathname)) calls.push(request.method());
    });
    await login(narrowPage);
    await narrowPage.goto('/admin/analytics/map');
    await expect(narrowPage.getByText('지도 현황은 데스크톱에서 이용할 수 있습니다.')).toBeVisible();
    await narrowPage.waitForTimeout(300);
    expect(calls).toEqual([]);
    await narrow.close();

    await login(page);
    for (const url of [REGIONS_URL, DISPATCH_URL]) {
      expect((await page.request.get(url)).status()).toBe(200);
      expect((await page.request.post(url)).status()).toBe(405);
    }

    let dispatchCalls = 0;
    await page.route(`**${DISPATCH_URL}`, (route) => {
      dispatchCalls += 1;
      return route.continue();
    });
    await page.goto('/admin/analytics/map');
    await expect.poll(() => dispatchCalls, { timeout: 12_000 }).toBeGreaterThanOrEqual(2);
  });
});
