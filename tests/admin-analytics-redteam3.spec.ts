import { expect, test, type Page } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';
import { buildMock, MAP_DISPATCH_SHAPE, MAP_REGIONS_SHAPE } from './helpers/shapes';

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

// 목 본문은 shapes.ts 상수에서 생성한다 — 같은 상수를 Layer 1 이 실응답에 대해
// 단언하므로 목과 실API의 드리프트가 구조적으로 불가능해진다.
// gapAlerts 도 인자로 받는다 — 호출부에서 스프레드로 덮어쓰면 그 값만 buildMock
// 검증을 빠져나가 목의 일부가 shape 결박에서 이탈한다.
const regionsPayload = (
  regions = [region('서울특별시', 3)],
  gapAlerts: Array<{ key: string; name: string; demand: number }> = [],
) => buildMock(MAP_REGIONS_SHAPE, {
  level: 'sido',
  sido: null,
  regions,
  gapAlerts,
  unknownLocation: { count: 2, reasons: { '주소 미상': 2 } },
  sigunguUnknown: 0,
  sourceLabel: '경계 시각화: VWorld 스냅샷 확보 후 제공 예정',
  asOf: '2026-07-18T00:00:00.000Z',
});

const dispatchPayload = buildMock(MAP_DISPATCH_SHAPE, {
  pins: [{ requestId: 'req-1', lookupCode: '900001', lat: 37.5, lng: 127.0, address: '서울특별시' }],
  unknownCount: 1,
  asOf: '2026-07-18T00:00:00.000Z',
});


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
    await loginAsAdmin(page);
    for (const sido of ['서울', 'toString', '__proto__', '세종특별자치시']) {
      const result = await jsonFromPage(page, `${REGIONS_URL}?sido=${encodeURIComponent(sido)}`);
      expect(result.status, sido).toBe(400);
    }
    const blank = await jsonFromPage(page, `${REGIONS_URL}?sido=`);
    expect([200, 400]).toContain(blank.status);
    expect(blank.status).not.toBe(500);
  });

  test('인증된 읽기 응답은 읽기 전용 스키마를 정확히 제공한다', async ({ page }) => {
    await loginAsAdmin(page);
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

  test('지역 API 실패를 빈 목록과 구분한다', async ({ page }) => {
    await page.route(`**${REGIONS_URL}`, route=>route.fulfill({status:500,json:{error:'regions failed'}}));
    await loginAsAdmin(page);
    await page.goto('/admin/analytics/map');
    await expect(page.locator('main [role=alert]')).toContainText('지역 데이터를 불러오지 못했습니다.');
    await expect(page.getByRole('button',{name:'다시 시도'})).toBeVisible();
    await expect(page.getByLabel('지역별 접수 목록')).toHaveCount(0);
  });

  test('출동 API 상태와 무관하게 지역을 조회한다', async ({ page }) => {
    await page.route(`**${REGIONS_URL}`, route=>route.fulfill({json:regionsPayload()}));
    await page.route(`**${DISPATCH_URL}`, route=>route.fulfill({status:500,json:{error:'dispatch failed'}}));
    await loginAsAdmin(page);
    await page.goto('/admin/analytics/map');
    await expect(page.getByRole('heading', {name:'지역별 접수',exact:true})).toBeVisible();
    await expect(page.getByRole('list', {name:'지역별 접수 목록'})).toContainText('서울특별시');
    await expect(page.getByText('dispatch failed')).toHaveCount(0);
  });

  test('17개 지역과 담당 등록 없는 10개 지역을 중복 없이 필터링하고 접수순을 유지한다', async ({ page }) => {
    const regions=Array.from({length:17},(_,index)=>region(`지역${index+1}`,17-index,index<10?0:1));
    await page.route(`**${REGIONS_URL}`, route=>route.fulfill({json:regionsPayload(regions)}));
    await loginAsAdmin(page);
    await page.goto('/admin/analytics/map');
    const list=page.getByRole('list',{name:'지역별 접수 목록'});
    await expect(list.getByRole('listitem')).toHaveCount(17);
    await page.getByRole('button',{name:'담당 등록 없음 10',exact:true}).click();
    await expect(list.getByRole('listitem')).toHaveCount(10);
    const values=await list.locator('[aria-label^="접수 "]').evaluateAll(nodes=>nodes.map(node=>Number(node.textContent?.replace(/\D/g,''))));
    expect(values).toEqual([17,16,15,14,13,12,11,10,9,8]);
    await page.getByRole('searchbox',{name:'지역 이름 검색'}).fill('지역3');
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list).toContainText('지역3');
    await page.getByRole('searchbox',{name:'지역 이름 검색'}).fill('없는 지역');
    await expect(page.getByText('검색한 지역이 없습니다.')).toBeVisible();
  });

  test('경계 미확보 시 목록을 유지하고 복구되면 지도를 표시한다', async ({ page }) => {
    await page.route('**/geo/manifest.json', route=>route.fulfill({status:404}));
    await loginAsAdmin(page);
    await page.goto('/admin/analytics/map');
    await expect(page.getByLabel('지도 안내')).toContainText('지도를 준비하지 못했습니다.');
    await page.unroute('**/geo/manifest.json');
    await page.getByRole('button',{name:'새로고침',exact:true}).click();
    await expect(page.getByRole('group',{name:'시도별 접수 지도'}).locator('path')).toHaveCount(17,{timeout:20000});
    await expect(page.getByLabel('지도 안내')).toHaveCount(0);
    await page.screenshot({path:'artifacts/g003-qa/map.jpg',type:'jpeg',quality:92,fullPage:true});
  });

  test('지역 집계는 45초에 갱신하고 출동 API는 조회하지 않는다', async ({ page }) => {
    let regionsCalls=0, dispatchCalls=0;
    await page.route(`**${REGIONS_URL}`, route=>{regionsCalls++;return route.fulfill({json:regionsPayload()});});
    await page.route(`**${DISPATCH_URL}`, route=>{dispatchCalls++;return route.fulfill({json:dispatchPayload});});
    await loginAsAdmin(page);
    await page.clock.install();
    await page.goto('/admin/analytics/map');
    await expect(page.getByRole('list',{name:'지역별 접수 목록'})).toBeVisible();
    expect(regionsCalls).toBe(1);
    await page.clock.fastForward(44000);
    expect(regionsCalls).toBe(1);
    await page.clock.fastForward(2000);
    await expect.poll(()=>regionsCalls).toBe(2);
    expect(dispatchCalls).toBe(0);
  });
  test('1023px와 1024px 모두 지도 정보를 조회한다', async ({ browser }) => {
    const narrow = await browser.newContext({ viewport: { width: 1023, height: 800 } });
    const narrowPage = await narrow.newPage();
    let mapCalls = 0;
    narrowPage.on('request', (request) => {
      if ([REGIONS_URL, DISPATCH_URL].includes(new URL(request.url()).pathname)) mapCalls += 1;
    });
    await loginAsAdmin(narrowPage);
    await narrowPage.goto('/admin/analytics/map');
    await expect(narrowPage.getByRole('heading', { name:'지역별 접수' })).toBeVisible();
    await narrowPage.waitForTimeout(300);
    expect(mapCalls).toBeGreaterThan(0);
    await narrow.close();

    const wide = await browser.newContext({ viewport: { width: 1024, height: 800 } });
    const widePage = await wide.newPage();
    await widePage.route(`**${REGIONS_URL}`, (route) => route.fulfill({ json: regionsPayload() }));
    await widePage.route(`**${DISPATCH_URL}`, (route) => route.fulfill({ json: dispatchPayload }));
    await loginAsAdmin(widePage);
    await widePage.goto('/admin/analytics/map');
    await expect(widePage.getByRole('heading', { name: '지역별 접수' })).toBeVisible();
    await wide.close();
  });
});
