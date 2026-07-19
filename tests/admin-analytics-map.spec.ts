import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const regions = {
  level: 'sido' as const,
  sido: null,
  regions: [
    { key: 'seoul', name: '서울특별시', hasSigungu: true, supply: 0, demand: 9, pressure: null, state: 'CRITICAL_ALERT' as const },
    { key: 'busan', name: '부산광역시', hasSigungu: true, supply: 2, demand: 6, pressure: 3, state: 'NORMAL' as const },
    { key: 'sejong', name: '세종특별자치시', hasSigungu: false, supply: 0, demand: 0, pressure: null, state: 'ZERO' as const },
    { key: 'jeju', name: '제주특별자치도', hasSigungu: true, supply: 0, demand: 0, pressure: null, state: 'ZERO' as const },
  ],
  gapAlerts: [{ key: 'seoul', name: '서울특별시', demand: 9 }],
  unknownLocation: { count: 2, reasons: { '주소 미입력': 1, '좌표만 제공': 1 } },
  sigunguUnknown: 0,
  sourceLabel: '경계 시각화: VWorld 스냅샷 확보 후 제공 예정',
  asOf: '2026-07-18T12:00:00.000Z',
};

const sigunguRegions = {
  ...regions,
  level: 'sigungu' as const,
  sido: '서울특별시',
  regions: [{ key: 'seoul-gangnam', name: '강남구', hasSigungu: false, supply: 1, demand: 4, pressure: 4, state: 'NORMAL' as const }],
  gapAlerts: [],
  sigunguUnknown: 3,
};

const dispatch = {
  pins: [{ requestId: 'request-1', lookupCode: 'REQ-001', lat: 37.4979, lng: 127.0276, address: '서울 강남구 테헤란로 1' }],
  unknownCount: 1,
  asOf: '2026-07-18T12:00:00.000Z',
};

async function login(page: Page) {
  await page.goto('/admin/login');
  await page.locator('#loginId').fill('admin');
  await page.locator('#password').fill('admin1234');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

const sidoGeo = {
  type: 'FeatureCollection',
  features: Array.from({ length: 17 }, (_, index) => ({
    type: 'Feature',
    properties: { regionKey: index === 0 ? 'seoul' : `region-${index}`, sido: index === 0 ? '서울특별시' : `지역${index}`, name: index === 0 ? '서울특별시' : `지역${index}`, code: String(index) },
    // d3-geo 구면 winding: 외곽 링은 반시계(면적이 작은 쪽) — 방향이 반대면 여집합(전 지구)이 렌더된다.
    geometry: { type: 'Polygon', coordinates: [[[126 + index * 0.1, 36], [126 + index * 0.1, 36.08], [126.08 + index * 0.1, 36.08], [126.08 + index * 0.1, 36], [126 + index * 0.1, 36]]] },
  })),
};
const sigunguGeo = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: { regionKey: 'seoul-gangnam', sido: '서울특별시', name: '강남구', code: '11680' }, geometry: { type: 'Polygon', coordinates: [[[127, 37], [127, 37.1], [127.1, 37.1], [127.1, 37], [127, 37]]] } }],
};

async function mockMap(page: Page, { regionsStatus = 200, geoStatus = 200, corruptGeo = false }: { regionsStatus?: number; geoStatus?: number; corruptGeo?: boolean } = {}) {
  let dispatchRequests = 0;
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const manifest = {
    schemaVersion: 1,
    version: '2026-07-18-fixture',
    referenceDate: '2026-07-18',
    license: '공공누리 제1유형 (출처표시)',
    sourceUrl: 'https://www.vworld.kr',
    sido: { file: 'kr-sido.2026-07-18-fixture.geo.json', sha256: corruptGeo ? '0'.repeat(64) : hash(sidoGeo), featureCount: 17 },
    sigungu: {
      서울특별시: { file: 'kr-sigungu.11.2026-07-18-fixture.geo.json', sha256: hash(sigunguGeo), featureCount: 1 },
    },
  };
  await page.route('**/geo/**', async (route) => {
    if (geoStatus !== 200) return route.fulfill({ status: geoStatus });
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('manifest.json')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(manifest) });
    if (pathname.endsWith(manifest.sido.file)) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(sidoGeo) });
    if (pathname.endsWith(manifest.sigungu.서울특별시.file)) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(sigunguGeo) });
    return route.fallback();
  });
  await page.route('**/api/admin/analytics/map/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'GET') return route.fulfill({ status: 405 });
    if (url.pathname.endsWith('/regions')) {
      return route.fulfill(regionsStatus === 200
        ? { contentType: 'application/json', body: JSON.stringify(url.searchParams.get('sido') === '서울특별시' ? sigunguRegions : regions) }
        : { contentType: 'application/json', status: regionsStatus, body: JSON.stringify({ error: '지역 집계를 불러올 수 없습니다' }) });
    }
    if (url.pathname.endsWith('/dispatch')) {
      dispatchRequests += 1;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(dispatch) });
    }
    return route.fallback();
  });
  return () => dispatchRequests;
}

test.describe('관리자 전국 지도 현황', () => {
  test('갭 경보, 수급 순위, 위치 미상과 출동 현황을 조회 전용으로 표시하고 시군구로 드릴다운한다', async ({ page }) => {
    await mockMap(page);
    await login(page);
    await page.getByRole('navigation', { name: '관리자 이동' }).getByRole('button', { name: '분석' }).click();
    await page.getByRole('menuitem', { name: '지도', exact: true }).click();

    await expect(page.getByRole('img', { name: '시도별 수급 압력 지도' }).locator('path')).toHaveCount(17);
    await expect(page.getByText('공공누리 제1유형 (출처표시) · 기준일 2026-07-18 · https://www.vworld.kr')).toBeVisible();
    await expect(page.getByText('지도 시각화(코로플레스)는 VWorld 행정경계 스냅샷 확보 후 제공 예정 — 현재는 지역 순위표로 제공됩니다')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '갭 경보' })).toBeVisible();
    await expect(page.getByText('공급 0명 · 수요 9건')).toBeVisible();
    await expect(page.getByRole('heading', { name: '수급 압력 순위표' })).toBeVisible();
    await expect(page.getByText('공급없음경보')).toBeVisible();
    await expect(page.getByText('위치 미상 2건')).toBeVisible();
    await expect(page.getByText('주소 미입력 1건')).toBeVisible();
    await expect(page.getByRole('heading', { name: '출동 현황' })).toBeVisible();
    await expect(page.getByText('차량 추적 아님 — 고객 목적지 기준')).toHaveCount(2);
    await expect(page.getByText('REQ-001')).toBeVisible();
    await expect(page.getByText('좌표 미상 1건')).toBeVisible();
    await expect(page.getByRole('button', { name: '세종특별자치시', exact: true })).toHaveCount(0);

    const boundaryRequests: string[] = [];
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.startsWith('/geo/kr-sigungu.')) boundaryRequests.push(pathname);
    });
    const drilldownRequest = page.waitForRequest((request) => new URL(request.url()).pathname.endsWith('/api/admin/analytics/map/regions') && new URL(request.url()).searchParams.get('sido') === '서울특별시');
    await page.getByLabel(/서울특별시: 공급 0명, 수요 9건/).click();
    await drilldownRequest;
    await expect(page).toHaveURL(/\?sido=%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C$/);
    await expect(page.getByText('서울특별시 시군구 미상 3건')).toBeVisible();
    await expect(page.getByText('강남구', { exact: true })).toBeVisible();
    await expect.poll(() => boundaryRequests).toEqual(['/geo/kr-sigungu.11.2026-07-18-fixture.geo.json']);
  });

  test('출동 현황은 8초 간격으로 재폴링한다', async ({ page }) => {
    const dispatchRequests = await mockMap(page);
    await login(page);
    await page.goto('/admin/analytics/map');
    await expect(page.getByText('REQ-001')).toBeVisible();
    await expect.poll(dispatchRequests, { timeout: 12_000 }).toBeGreaterThanOrEqual(2);
  });
  test('지역 집계가 실패해도 출동 현황을 표시한다', async ({ page }) => {
    await mockMap(page, { regionsStatus: 500 });
    await login(page);
    await page.goto('/admin/analytics/map');

    await expect(page.getByRole('heading', { name: '출동 현황' })).toBeVisible();
    await expect(page.getByText('REQ-001')).toBeVisible();
  });


  test('경계 파일이 없으면 순위표와 안내 배너를 유지한다', async ({ page }) => {
    await mockMap(page, { geoStatus: 404 });
    await login(page);
    await page.goto('/admin/analytics/map');

    await expect(page.getByText('지도 시각화(코로플레스)는 VWorld 행정경계 스냅샷 확보 후 제공 예정 — 현재는 지역 순위표로 제공됩니다')).toBeVisible();
    await expect(page.getByRole('heading', { name: '수급 압력 순위표' })).toBeVisible();
  });
  test('checksum mismatch displays a corrupt-boundary banner while retaining the ranking table', async ({ page }) => {
    await mockMap(page, { corruptGeo: true });
    await login(page);
    await page.goto('/admin/analytics/map');

    await expect(page.locator('section[role="alert"]')).toContainText('경계 데이터를 불러오지 못했습니다 — boundary checksum mismatch');
    await expect(page.getByRole('heading', { name: '수급 압력 순위표' })).toBeVisible();
    await expect(page.getByText('스냅샷 확보 후 제공 예정')).toHaveCount(0);
  });
  test('1023px 이하에서는 지도 API를 요청하지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 1023, height: 800 });
    const requests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/admin/analytics/map/')) requests.push(request.method());
    });
    await login(page);
    await page.goto('/admin/analytics/map');
    await expect(page.getByText('지도 현황은 데스크톱에서 이용할 수 있습니다.')).toBeVisible();
    expect(requests).toHaveLength(0);
  });

  test('실제 API는 GET만 허용하고 인증·sido 입력을 검증한다', async ({ page, request }) => {
    const anonymous = await request.get('/api/admin/analytics/map/regions');
    expect(anonymous.status()).toBe(401);

    await login(page);
    expect((await page.request.get('/api/admin/analytics/map/regions')).status()).toBe(200);
    expect((await page.request.post('/api/admin/analytics/map/regions')).status()).toBe(405);
    expect((await page.request.get('/api/admin/analytics/map/regions?sido=not-a-region')).status()).toBe(400);
    expect((await page.request.get('/api/admin/analytics/map/regions?sido=세종특별자치시')).status()).toBe(400);
    expect((await page.request.get('/api/admin/analytics/map/regions?sido=toString')).status()).toBe(400);
    expect((await page.request.get('/api/admin/analytics/map/regions?sido=__proto__')).status()).toBe(400);
  });
});
