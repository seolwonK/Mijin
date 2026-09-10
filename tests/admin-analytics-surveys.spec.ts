import type { SurveyOverview } from '../src/lib/surveyAnalytics';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { apiContextOptions, seedSession } from './helpers/auth';
import { FixtureFactory } from './helpers/fixtures';
import { buildMock, SURVEYS_SHAPE, shapeViolations } from './helpers/shapes';

const prisma = new PrismaClient();
const fixtures = new FixtureFactory(prisma);
const rows = Array.from({ length: 52 }, (_, i) => ({
  surveyId: `survey-${i}`, requestId: `request-${i}`, requestCode: `SURVEY-${String(i).padStart(3, '0')}`,
  customerName: `설문 고객 ${i}`, customerPhone: '01000000000', elapsedDays: 7,
  createdAt: '2026-09-01T00:00:00.000Z', submittedAt: i === 3 ? null : '2026-09-02T00:00:00.000Z',
  rating: i === 3 ? null : 5, paidAmount: i === 0 ? 150000 : i === 1 ? 0 : null,
}));
const overview = (items = rows, page = 1) => buildMock(SURVEYS_SHAPE, {
  responseRate: 51 / 52, submitted: 51, total: 52,
  surveys: { items: items.slice((page - 1) * 50, page * 50), total: items.length, page, pageSize: 50, pageCount: Math.max(1, Math.ceil(items.length / 50)), hasNext: page * 50 < items.length },
  paidStats: { sum: 150000, count: 2, avg: 75000 }, updatedAt: '2026-09-10T00:00:00.000Z',
});
test.afterAll(async () => { await fixtures.cleanupAll(); await prisma.$disconnect(); });

async function setupUi(page: import('@playwright/test').Page) {
  await seedSession(page.context(), 'ADMIN');
  await page.route('**/api/admin/analytics/surveys**', route => {
    const params = new URL(route.request().url()).searchParams;
    let list = rows;
    if (params.get('status') === 'SUBMITTED') list = list.filter(row => row.submittedAt);
    if (params.get('status') === 'PENDING') list = list.filter(row => !row.submittedAt);
    if (params.get('q')) list = list.filter(row => row.customerName.includes(params.get('q')!));
    return route.fulfill({ json: overview(list, Number(params.get('page') || 1)) });
  });
}

test('전체 목록·고객 입력 금액·0원·미입력·응답일·접수 연결을 표시한다', async ({ page }) => {
  await setupUi(page);
  await page.goto('/admin');
  await page.getByRole('navigation', { name: '관리자 이동' }).getByRole('button', { name: '분석' }).click();
  await page.getByRole('link', { name: '설문', exact: true }).click();
  await expect(page.getByRole('button', { name: '전체', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('tbody tr')).toHaveCount(50);
  const row = (code: string) => page.getByRole('row').filter({ hasText: code });
  await expect(row('SURVEY-000')).toContainText('150,000원');
  await expect(row('SURVEY-001')).toContainText('0원');
  await expect(row('SURVEY-002')).toContainText('금액 미입력');
  await expect(row('SURVEY-003')).toContainText('미응답');
  await expect(row('SURVEY-003')).not.toContainText('금액 미입력');
  await expect(row('SURVEY-000').getByRole('link', { name: 'SURVEY-000' })).toHaveAttribute('href', '/admin/requests/request-0');
  await expect(row('SURVEY-000').getByRole('link', { name: '01000000000' })).toHaveAttribute('href', 'tel:01000000000');
  await expect(page.getByText('발송 대비 제출 비율')).toHaveCount(0);
});

test('페이지 이동 후 응답 필터·검색 변경은 첫 페이지부터 조회한다', async ({ page }) => {
  await setupUi(page);
  await page.goto('/admin/analytics/surveys');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(page.locator('tbody')).toContainText('SURVEY-050');
  await expect(page.getByRole('button', { name: '다음', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '미응답', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody')).toContainText('SURVEY-003');
  await expect(page.getByRole('button', { name: '이전', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '응답 완료', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(50);
  await expect(page.locator('tbody')).not.toContainText('SURVEY-003');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByLabel('접수번호·고객명·전화번호 검색').fill('설문 고객 0');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody')).toContainText('SURVEY-000');
  await expect(page.getByRole('button', { name: '이전', exact: true })).toBeDisabled();
  await expect(page.getByRole('region', { name: '전체 설문 요약' })).toContainText('52건');
  await page.getByRole('button', { name: '검색 해제' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(50);
});

test('모바일에서도 목록·금액·필터를 확인하고 가로로 넘치지 않는다', async ({ page }) => {
  await setupUi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/analytics/surveys');
  await expect(page.getByRole('listitem').filter({ hasText: 'SURVEY-000' })).toContainText('150,000원');
  await expect(page.getByRole('listitem').filter({ hasText: 'SURVEY-001' })).toContainText('0원');
  await expect(page.getByRole('listitem').filter({ hasText: 'SURVEY-002' })).toContainText('금액 미입력');
  await page.getByRole('button', { name: '미응답', exact: true }).click();
  await expect(page.getByRole('list', { name:'모바일 설문 목록' }).getByRole('listitem')).toHaveCount(1);
  for (const width of [320, 390, 768, 1023, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('오류와 빈 목록을 구분하고 재시도·지연 응답에도 선택한 필터를 유지한다', async ({ page }) => {
  await seedSession(page.context(), 'ADMIN');
  let failed = true;
  let delaySubmitted = false;
  await page.route('**/api/admin/analytics/surveys**', async route => {
    const params = new URL(route.request().url()).searchParams;
    if (failed) return route.fulfill({ status: 503, json: {} });
    if (delaySubmitted && params.get('status') === 'SUBMITTED') await new Promise(resolve => setTimeout(resolve, 350));
    return route.fulfill({ json: overview(params.get('status') === 'PENDING' ? [] : rows.slice(0, 4)) });
  });
  await page.goto('/admin/analytics/surveys');
  await expect(page.getByRole('alert').filter({ hasText: '설문 목록을 불러오지 못했습니다.' })).toBeVisible();
  await expect(page.getByText('아직 생성된 설문이 없습니다.')).toHaveCount(0);
  failed = false;
  await page.getByRole('button', { name: '다시 시도' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(4);
  delaySubmitted = true;
  const slow = page.waitForResponse(r => r.url().includes('status=SUBMITTED'));
  await page.getByRole('button', { name: '응답 완료', exact: true }).click();
  await page.getByRole('button', { name: '미응답', exact: true }).click();
  await expect(page.getByText('미응답 설문이 없습니다.', { exact: true })).toBeVisible();
  await slow;
  await expect(page.locator('tbody tr')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '미응답', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('실제 API: 전체·완료·미응답·52번째 이후·검색·0원/미입력·금액 무변경', async ({ playwright }) => {
  const admin = await playwright.request.newContext(await apiContextOptions('ADMIN'));
  const marker = `설문필터${randomUUID().slice(0, 8)}`;
  const partner = await fixtures.createPartnerFixture({ isActive: false });
  const requests = await Promise.all(Array.from({ length: 54 }, (_, i) => fixtures.createRequestFixture({ status: 'COMPLETED', customerName: `${marker} 고객 ${i}` })));
  const stamp = Date.now();
  await prisma.satisfactionSurvey.createMany({ data: requests.map((r, i) => ({
    requestId: r.id, providerId: partner.providerId, token: randomUUID(), createdAt: new Date(stamp - i * 1000),
    submittedAt: i % 2 === 0 ? new Date(stamp) : null, rating: i % 2 === 0 ? 5 : null,
    paidAmount: i === 0 ? 0 : i === 2 || i % 2 !== 0 ? null : i * 1000,
  })) });
  const get = async (params = '') => {
    const response = await admin.get(`/api/admin/analytics/surveys?q=${encodeURIComponent(marker)}${params}`);
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toContain('no-store');
    const data = await response.json() as SurveyOverview;
    expect(shapeViolations(data, SURVEYS_SHAPE)).toEqual([]);
    return data;
  };
  try {
    const all = await get();
    expect(all.surveys.total).toBe(54);
    expect(all.surveys.items).toHaveLength(50);
    expect(all.surveys.items[0]).toMatchObject({ requestId: requests[0].id, paidAmount: 0 });
    expect(all.surveys.items[2]).toMatchObject({ requestId: requests[2].id, paidAmount: null });
    const second = await get('&page=2');
    expect(second.surveys.items).toHaveLength(4);
    expect(second.surveys.hasNext).toBe(false);
    const ids = [...all.surveys.items, ...second.surveys.items].map(row => row.requestId);
    expect(ids).toEqual(requests.map(r => r.id));
    expect(new Set(ids).size).toBe(54);
    expect((await get('&page=999')).surveys.page).toBe(2);
    for (const status of ['SUBMITTED', 'PENDING']) {
      const body = await get(`&status=${status}`);
      expect(body.surveys.total).toBe(27);
      expect(body.surveys.items.every(row => status === 'SUBMITTED' ? row.submittedAt !== null : row.submittedAt === null)).toBe(true);
      expect(body.paidStats).toEqual(all.paidStats);
      expect(body.total).toBe(all.total);
    }
    for (const q of [requests[0].lookupCode, requests[0].customerPhone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')]) {
      const body = await (await admin.get(`/api/admin/analytics/surveys?q=${encodeURIComponent(q)}`)).json() as SurveyOverview;
      expect(body.surveys.items.some(row => row.requestId === requests[0].id)).toBe(true);
    }
    const empty = await (await admin.get(`/api/admin/analytics/surveys?q=${marker}없는고객`)).json();
    expect(empty.surveys).toMatchObject({ items: [], total: 0, page: 1, hasNext: false });
    const saved = await prisma.satisfactionSurvey.findMany({ where: { requestId: { in: requests.map(r => r.id) } } });
    expect(saved).toHaveLength(54);
    expect(saved.find(row => row.requestId === requests[0].id)?.paidAmount).toBe(0);
  } finally { await admin.dispose(); }
});

test('API는 관리자 GET만 허용하고 잘못된 조회 조건을 거부한다', async ({ playwright }) => {
  for (const role of [null, 'PROVIDER', 'TECHNICIAN'] as const) {
    const context = await playwright.request.newContext(await apiContextOptions(role, { providerId: 'not-admin', technicianId: 'not-admin' }));
    expect((await context.get('/api/admin/analytics/surveys?status=ALL')).status()).toBe(401);
    await context.dispose();
  }
  const admin = await playwright.request.newContext(await apiContextOptions('ADMIN'));
  try {
    for (const query of ['status=UNKNOWN', 'page=0', 'page=-1', 'page=1.5', 'page=no', 'page=1000001', `q=${'a'.repeat(101)}`]) {
      expect((await admin.get(`/api/admin/analytics/surveys?${query}`)).status()).toBe(400);
    }
    expect((await admin.post('/api/admin/analytics/surveys')).status()).toBe(405);
  } finally { await admin.dispose(); }
});
