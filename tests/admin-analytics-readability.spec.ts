import { expect, test } from '@playwright/test';
import type { DashboardStats } from '../src/lib/analyticsStats';
import { loginAsAdmin } from './helpers/auth';
import {
  buildMock,
  DASHBOARD_SHAPE,
  MAP_REGIONS_SHAPE,
} from './helpers/shapes';

const fixture = buildMock(DASHBOARD_SHAPE, {
  operational: {
    byStatus: {
      RECEIVED: 8,
      ASSIGNED: 3,
      ACCEPTED: 2,
      DISPATCHED: 4,
      COMPLETED: 900,
      CANCELED: 700,
    },
    needsAttention: 1,
    byUrgencyOpen: { CRITICAL: 2, URGENT: 3, NORMAL: 12 },
  },
  trend: [
    { bucket: '2026-09-09', received: 4, completed: 8 },
    { bucket: '2026-09-10', received: 2, completed: 1 },
  ],
  performance: {
    op: {
      firstOfferSec: { mean: 0, median: 0, p90: 0 },
      offerAcceptRate: null,
      accepted: 0,
      rejected: 0,
    },
    cust: {
      acceptSec: { mean: null, median: null, p90: null },
      requestSuccessRate: 0.5,
      requestsWithAccepted: 3,
      totalRequests: 6,
    },
  },
  money: {
    surveyPaid: { sum: 90000, count: 3, avg: 30000 },
    commission: { PENDING: 500, PAID: 800 },
  },
  updatedAt: '2026-09-10T04:00:00.000Z',
});

test('현재 업무와 기간 실적을 분리하고 날짜별 원본 건수를 키보드·표로 확인한다', async ({
  page,
}) => {
  await page.route('**/api/admin/analytics/dashboard?period=*', (route) =>
    route.fulfill({ json: fixture }),
  );
  await loginAsAdmin(page);
  await page.goto('/admin/analytics/dashboard');
  const current = page.getByRole('region', { name: '현재 남은 업무' });
  await expect(current).toContainText('17건');
  await expect(
    current.getByRole('link', { name: '출동·작업 중 6' }),
  ).toHaveAttribute('href', '/admin?tab=ACTIVE');
  const period = page.getByLabel('선택 기간 요약');
  await expect(period).toContainText('새 접수6건');
  await expect(period).toContainText('작업 완료9건');
  await expect(period).toContainText('50%');
  await expect(
    page.getByText('2026-09-09 — 2026-09-10 · 오늘 포함'),
  ).toBeVisible();
  const day = page.getByRole('button', {
    name: '9월 9일 새 접수 4건, 작업 완료 8건',
  });
  await day.focus();
  await page.keyboard.press('Enter');
  await expect(day).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status')).toContainText(
    '새 접수 4건 · 작업 완료 8건',
  );
  await page.getByText('날짜별 수치 보기', { exact: true }).click();
  const table = page.getByRole('table', { name: '날짜별 접수와 완료 건수' });
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(table.getByRole('row').nth(1)).toContainText('2026-09-094건8건');
  const money = page.getByRole('region', { name: '고객이 신고한 작업 금액' });
  await expect(money).toContainText('90,000원');
  await expect(money).toContainText('금액 입력 설문3건');
  await expect(money).toContainText('건당 평균30,000원');
  await expect(money.getByRole('link')).toHaveAttribute(
    'href',
    '/admin/settlements',
  );
  await page
    .getByText('숫자는 어떤 기준으로 집계하나요?', { exact: true })
    .click();
  await expect(page.getByText(/완료는 완료일 기준이므로/)).toBeVisible();
});

test('활동 0건·비율 미집계·금액 미입력을 NaN이나 가짜 비율로 표시하지 않는다', async ({
  page,
}) => {
  const empty = structuredClone(fixture) as unknown as DashboardStats;
  empty.trend = empty.trend.map((row) => ({
    ...row,
    received: 0,
    completed: 0,
  }));
  empty.performance.cust = {
    ...empty.performance.cust,
    requestSuccessRate: null,
    totalRequests: 0,
    requestsWithAccepted: 0,
  };
  empty.money.surveyPaid = { sum: 0, count: 0, avg: null };
  await page.route('**/api/admin/analytics/dashboard?period=*', (route) =>
    route.fulfill({ json: empty }),
  );
  await loginAsAdmin(page);
  await page.goto('/admin/analytics/dashboard');
  await expect(page.getByLabel('선택 기간 요약')).toContainText('집계 없음');
  await expect(page.getByText('하루 최대 0건')).toBeVisible();
  await expect(
    page.getByRole('region', { name: '고객이 신고한 작업 금액' }),
  ).toContainText('건당 평균집계 없음');
  await expect(page.locator('main').last()).not.toContainText(/NaN|Infinity/);
});

test('접수 없는 지도는 담당자 확보로 해석하지 않고 전체 지역에서 0건을 확인한다', async ({
  page,
}) => {
  const empty = buildMock(MAP_REGIONS_SHAPE, {
    level: 'sido',
    sido: null,
    regions: [
      {
        key: 'seoul',
        name: '서울특별시',
        hasSigungu: true,
        supply: 0,
        demand: 0,
        pressure: null,
        state: 'ZERO',
      },
    ],
    gapAlerts: [],
    unknownLocation: { count: 0, reasons: {} },
    sigunguUnknown: 0,
    sourceLabel: '',
    asOf: '2026-09-10T04:00:00Z',
  });
  await page.route('**/api/admin/analytics/map/regions', (route) =>
    route.fulfill({ json: empty }),
  );
  await loginAsAdmin(page);
  await page.goto('/admin/analytics/map');
  await expect(page.getByText('최근 30일 접수가 없습니다.')).toBeVisible();
  await expect(
    page.getByRole('list', { name: '지역별 접수 목록' }).getByRole('listitem'),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '전체 지역 보기' }).click();
  await expect(
    page.getByRole('list', { name: '지역별 접수 목록' }),
  ).toContainText('서울특별시');
  await expect(
    page.getByRole('list', { name: '지역별 접수 목록' }).getByLabel('접수 0건'),
  ).toBeVisible();
});

for (const width of [320, 390, 768, 1280, 1440, 1920])
  test(`${width}px에서 현황 30일 차트와 지도 목록이 화면 밖으로 밀리지 않는다`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 960 });
    await loginAsAdmin(page);
    for (const route of ['dashboard', 'map']) {
      await page.goto(`/admin/analytics/${route}`);
      if (route === 'dashboard') {
        await page
          .getByRole('button', { name: '최근 30일', exact: true })
          .click();
        await expect(page.getByLabel('선택 기간 요약')).toBeVisible();
        await expect(
          page
            .getByRole('group', { name: '일별 접수·완료 비교' })
            .getByRole('button'),
        ).toHaveCount(30);
      } else {
        await expect(
          page.getByRole('heading', { name: '지역별 접수', exact: true }),
        ).toBeVisible();
        await page.getByRole('button', { name: /^전체 \d+$/ }).click();
        await expect(
          page
            .getByRole('list', { name: '지역별 접수 목록' })
            .getByRole('listitem'),
        ).toHaveCount(17);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
    }
  });
