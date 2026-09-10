import { expect, test, type Page } from '@playwright/test';
import { seedSession } from './helpers/auth';
import { REGIONS } from '../src/lib/regions';

const candidates = Array.from({ length: 28 }, (_, index) => ({
  id: `rotation-${index}`, key: `${index % 2 ? 'TECHNICIAN' : 'PROVIDER'}:rotation-${index}`,
  kind: index % 2 ? 'TECHNICIAN' : 'PROVIDER', name: index === 0 ? '한빛전기 현장지원센터 긴 이름의 업체' : `순환 후보 ${String(index + 1).padStart(2, '0')}`,
  eggBalance: index === 0 ? 30 : 0, assigned30d: index, avgRating: index === 2 ? 3 : 4.5, reviewCount: index === 2 ? 0 : 2,
}));
const overview = {
  totals: { candidates: 28, providers: 14, technicians: 14, withEggs: 1 },
  regions: Object.entries(REGIONS).map(([sido, districts]) => ({ sido, count: sido === '부산광역시' ? 28 : sido === '서울특별시' ? 2 : 0,
    districts: (districts.length ? districts : ['']).map(sigungu => ({ sigungu, count: sido === '부산광역시' ? 28 : 0 })),
    recommendedSigungu: sido === '부산광역시' ? '해운대구' : districts[0] ?? '',
  })),
  recommended: { sido: '부산광역시', sigungu: '해운대구' },
};
const meta = { chainLabel: '지역→알 보유량→30일 순환', eggApplied: true, criticalNotApplied: true, distanceTieUnresolved: true };
const body = (rows = candidates) => ({ candidates: rows, meta });
const rankingTable = (page: Page) => page.getByRole('table', { name: '지역별 배정 참고 순위' });

test.beforeEach(async ({ page }) => {
  await seedSession(page.context(), 'ADMIN');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route('**/api/admin/rotation?*', route => route.fulfill({ json: new URL(route.request().url()).searchParams.get('view') === 'overview' ? overview : body() }));
});

test('진입 즉시 전국 요약과 추천 지역 순위를 노출하고 1순위·관리 링크·후기 없음을 표시한다', async ({ page }) => {
  await page.goto('/admin/rotation');
  await expect(page.getByRole('region', { name: '전국 배정 대상 요약' })).toContainText('28');
  await expect(page).toHaveURL(/sido=.*&sigungu=/);
  await expect(page.getByRole('heading', { name: /부산광역시.*해운대구/ })).toBeVisible();
  await expect(rankingTable(page).locator('tbody tr')).toHaveCount(25);
  await expect(page.getByLabel('지역 1순위 후보').getByRole('link')).toHaveAttribute('href', '/admin/providers/rotation-0');
  const third = rankingTable(page).locator('tbody tr').nth(2);
  await expect(third).toContainText('후기 없음');
  await expect(third).not.toContainText('3.0');
  await expect(page.getByText(/초긴급은 지역·알·거리 기준을 별도로 적용/)).toBeVisible();
  await expect(rankingTable(page).getByRole('columnheader').getByRole('button')).toHaveCount(0);
});

test('이름 검색·업체/기사 필터·페이지 이동은 원래 순번을 보존한다', async ({ page }) => {
  await page.goto('/admin/rotation');
  await page.getByRole('navigation', { name: '순환 후보 페이지' }).getByRole('button', { name: '다음' }).click();
  await expect(rankingTable(page).locator('tbody tr')).toHaveCount(3);
  await expect(rankingTable(page).locator('tbody tr').first()).toContainText('26');
  await page.getByRole('group', { name: '후보 구분' }).getByRole('button', { name: /전기기사/ }).click();
  await expect(rankingTable(page).locator('tbody tr')).toHaveCount(14);
  await expect(rankingTable(page).locator('tbody tr').first().locator('td').first()).toHaveText('02');
  await page.getByRole('searchbox', { name: '후보 이름 검색' }).fill('후보 28');
  await expect(rankingTable(page).locator('tbody tr')).toHaveCount(1);
  await expect(rankingTable(page).locator('tbody tr').first().locator('td').first()).toHaveText('28');
  await page.getByRole('searchbox', { name: '후보 이름 검색' }).fill('없는 후보');
  await expect(page.getByRole('status')).toContainText('검색 조건에 맞는 후보가 없습니다.');
  await page.getByRole('button', { name: '검색·필터 초기화' }).click();
  await expect(rankingTable(page).locator('tbody tr')).toHaveCount(25);
});

test('지역 전환·시도 공통 담당·세종과 마지막 조회 지역 복원', async ({ page }) => {
  await page.goto('/admin/rotation');
  await expect(rankingTable(page)).toBeVisible();
  await page.getByRole('group', { name: '시/도별 후보 수' }).getByRole('button', { name: /^서울/ }).click();
  await page.getByRole('combobox', { name: '시/군/구 선택' }).selectOption('서초구');
  await expect(page.getByRole('heading', { name: /서울특별시.*서초구/ })).toBeVisible();
  await page.goto('/admin/rotation');
  await expect(page.getByRole('heading', { name: /서울특별시.*서초구/ })).toBeVisible();
  await page.getByRole('combobox', { name: '시/군/구 선택' }).selectOption('');
  await expect(page.getByText('시/도 전체를 담당하는 후보만 표시합니다.', { exact: false })).toBeVisible();
  await page.getByRole('group', { name: '시/도별 후보 수' }).getByRole('button', { name: /^세종/ }).click();
  await expect(page.getByRole('combobox', { name: '시/군/구 선택' })).toBeDisabled();
  await page.goto('/admin/rotation?sido=부산광역시&sigungu=해운대구');
  await expect(page.getByRole('heading', { name: /부산광역시.*해운대구/ })).toBeVisible();
  await page.goto('/admin/rotation');
  await expect(page.getByRole('heading', { name: /부산광역시.*해운대구/ })).toBeVisible();
});

test('늦은 이전 지역 응답은 새 지역의 순위에 섞이지 않는다', async ({ page }) => {
  await page.route('**/api/admin/rotation?sido=*', async route => {
    const sido = new URL(route.request().url()).searchParams.get('sido');
    if (sido === '서울특별시') await new Promise(resolve => setTimeout(resolve, 650));
    await route.fulfill({ json: body([{ ...candidates[0], name: sido === '서울특별시' ? '이전 지역 후보' : '현재 지역 후보' }]) });
  });
  await page.goto('/admin/rotation');
  await expect(rankingTable(page)).toBeVisible();
  const regions = page.getByRole('group', { name: '시/도별 후보 수' });
  await regions.getByRole('button', { name: /^서울/ }).click();
  await expect(page.getByRole('heading', { name: /서울특별시.*강남구/ })).toBeVisible();
  await regions.getByRole('button', { name: /^부산/ }).click();
  await expect(rankingTable(page)).toContainText('현재 지역 후보');
  await page.waitForTimeout(800);
  await expect(page.getByText('이전 지역 후보', { exact: true })).toHaveCount(0);
});

test('요약 실패에도 지역 직접 조회, 순위 조회 실패·재시도·빈 후보를 구분한다', async ({ page }) => {
  let fail = true;
  await page.route('**/api/admin/rotation?*', route => {
    const isOverview = new URL(route.request().url()).searchParams.get('view') === 'overview';
    return route.fulfill(isOverview || fail ? { status: 503, json: {} } : { json: body([]) });
  });
  await page.goto('/admin/rotation');
  await expect(page.getByRole('alert')).toHaveCount(1);
  await page.getByRole('group', { name: '시/도별 후보 수' }).getByRole('button', { name: /^서울/ }).click();
  const board = page.getByRole('region', { name: '선택 지역 순환 순위' });
  await expect(board.getByRole('alert')).toBeVisible();
  fail = false;
  await board.getByRole('button', { name: '다시 시도' }).click();
  await expect(board.getByText('이 지역의 배정 대상이 없습니다.')).toBeVisible();
  await expect(board.getByRole('link', { name: '업체 관리 ↗' })).toHaveAttribute('href', '/admin/providers');
});

test('갱신 실패에는 마지막 조회 자료임을 밝히고 자동 폴링을 유지한다', async ({ page }) => {
  let count = 0;
  await page.route('**/api/admin/rotation?sido=*', route => {
    count++;
    return route.fulfill(count === 1 ? { json: body() } : { status: 503, json: {} });
  });
  await page.clock.install();
  await page.goto('/admin/rotation');
  await expect(rankingTable(page)).toBeVisible();
  await page.clock.fastForward(31_000);
  await expect(page.getByRole('region', { name: '선택 지역 순환 순위' }).getByRole('alert')).toContainText('최근 조회한 자료를 표시하고 있습니다.');
  await expect(rankingTable(page).locator('tbody tr')).toHaveCount(25);
  expect(count).toBeGreaterThanOrEqual(2);
});

for (const width of [320, 390, 768, 1280]) {
  test(`${width}px에서 순환 데이터·지역 선택·검색·관리 이동을 이용할 수 있다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/admin/rotation');
    await expect(page.getByLabel('지역 1순위 후보')).toBeVisible();
    await expect(page.getByText('이 화면은 데스크톱', { exact: false })).toHaveCount(0);
    await page.getByRole('searchbox', { name: '후보 이름 검색' }).fill('후보 28');
    await expect(page.getByRole('link', { name: /순환 후보 28/ }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width < 768) await page.getByRole('combobox', { name: '시/도 선택' }).selectOption('서울특별시');
    else await page.getByRole('group', { name: '시/도별 후보 수' }).getByRole('button', { name: /^서울/ }).click();
    await expect(page.getByRole('heading', { name: /서울특별시.*강남구/ })).toBeVisible();
  });
}
