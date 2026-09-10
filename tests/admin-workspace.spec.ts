import { expect, test, type Page } from '@playwright/test';
import { seedSession } from './helpers/auth';
import { mockQueue } from './helpers/admin-queue';

const tabs = (page: Page) => page.getByRole('navigation', { name: '열린 업무', exact: true }).locator('ol');
const menu = (page: Page) => page.getByRole('navigation', { name: '관리자 이동', exact: true });

test.beforeEach(async ({ page }) => {
  await seedSession(page.context(), 'ADMIN');
  await mockQueue(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
});

test('업무 탭은 중복 없이 열리고 새로고침·직접 주소·뒤로가기를 지원한다', async ({ page }) => {
  await page.goto('/admin?tab=RECEIVED');
  await menu(page).getByRole('link', { name: '업체 관리', exact: true }).click();
  await menu(page).getByRole('link', { name: '전기기사 관리', exact: true }).click();
  await expect(tabs(page).getByRole('link')).toHaveCount(3);
  await tabs(page).getByRole('link', { name: /대시보드/ }).click();
  await expect(page).toHaveURL(/\/admin\?tab=RECEIVED$/);
  await expect(page.getByRole('group', { name: '접수 상태 필터' }).getByRole('button', { name: /^배정대기/ })).toHaveAttribute('aria-pressed', 'true');
  await page.goBack();
  await expect(tabs(page).getByRole('link', { name: '전기기사 관리', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.reload();
  await expect(tabs(page).getByRole('link')).toHaveCount(3);
  await menu(page).getByRole('link', { name: '업체 관리', exact: true }).click();
  await expect(tabs(page).getByRole('link')).toHaveCount(3);
  await page.goto('/admin/analytics/surveys');
  await expect(tabs(page).getByRole('link', { name: '고객 설문', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(menu(page).getByRole('link', { name: '설문', exact: true })).toBeVisible();
});

test('현재 탭 닫기는 인접 업무로 이동하고 비활성 탭 닫기는 현재 업무를 유지한다', async ({ page }) => {
  await page.goto('/admin');
  await menu(page).getByRole('link', { name: '업체 관리', exact: true }).click();
  await menu(page).getByRole('link', { name: '전기기사 관리', exact: true }).click();
  await tabs(page).getByRole('button', { name: '업체 관리 탭 닫기' }).click();
  await expect(page).toHaveURL(/\/admin\/technicians$/);
  await expect(tabs(page).getByRole('link')).toHaveCount(2);
  await tabs(page).getByRole('button', { name: '전기기사 관리 탭 닫기' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(tabs(page).getByRole('link')).toHaveCount(1);
  await expect(tabs(page).getByRole('link', { name: /대시보드/ })).toBeFocused();
  await expect(tabs(page).getByRole('button', { name: /탭 닫기/ })).toHaveCount(0);
});

test('탭 키보드 이동·Delete 닫기와 열린 업무 목록의 다른 탭 닫기', async ({ page }) => {
  await page.goto('/admin');
  for (const href of ['/admin/providers', '/admin/technicians', '/admin/settings']) {
    await menu(page).locator(`a[href="${href}"]`).click();
  }
  const first = tabs(page).getByRole('link').first();
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs(page).getByRole('link', { name: '업체 관리', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/admin\/providers$/);
  await page.keyboard.press('Delete');
  await expect(page).toHaveURL(/\/admin$/);
  await first.focus(); await page.keyboard.press('End');
  await expect(tabs(page).getByRole('link', { name: '설정', exact: true })).toBeFocused();
  await page.keyboard.press('Home'); await expect(first).toBeFocused();
  await tabs(page).getByRole('link', { name: '전기기사 관리', exact: true }).click();
  await page.getByLabel('열린 업무 목록', { exact: true }).click();
  await page.getByRole('button', { name: '다른 탭 닫기' }).click();
  await expect(tabs(page).getByRole('link')).toHaveCount(2);
  await expect(page).toHaveURL(/\/admin\/technicians$/);
  await page.getByLabel('열린 업무 목록', { exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '다른 탭 닫기' })).toBeHidden();
});

test('메뉴 검색·검색 초기화·트리 접힘 유지·사이드바 접기', async ({ page }) => {
  await page.goto('/admin');
  const search = page.getByRole('searchbox', { name: '업무 메뉴 검색' });
  await menu(page).getByRole('button', { name: '정산', exact: true }).click();
  await expect(menu(page).getByRole('link', { name: '정산 집계' })).toBeHidden();
  await menu(page).getByRole('link', { name: '업체 관리', exact: true }).click();
  await expect(menu(page).getByRole('link', { name: '정산 집계' })).toBeHidden();
  await search.fill('없는 메뉴');
  await expect(page.getByRole('status')).toContainText('일치하는 메뉴가 없습니다.');
  await search.fill('고객 설문');
  await expect(menu(page).getByRole('link')).toHaveCount(1);
  await menu(page).getByRole('link', { name: '설문', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(menu(page).getByRole('button', { name: '분석' })).toHaveAttribute('aria-expanded', 'true');
  const before = (await page.locator('#admin-content').boundingBox())!.width;
  await page.getByRole('button', { name: '업무 메뉴 접기' }).click();
  await expect(page.getByRole('complementary', { name: '관리자 메뉴', exact: true })).toBeHidden();
  expect((await page.locator('#admin-content').boundingBox())!.width).toBeGreaterThan(before);
  await page.getByRole('button', { name: '업무 메뉴 펼치기' }).click();
  await expect(menu(page).getByRole('link', { name: '설문', exact: true })).toBeVisible();
});

for (const width of [320, 390, 768, 1280]) {
  test(`${width}px 열린 탭이 많아도 가로 넘침 없이 목록에서 전환한다`, async ({ page }) => {
    await page.goto('/admin');
    for (const href of ['/admin/providers', '/admin/technicians', '/admin/commissions', '/admin/settlements', '/admin/rotation', '/admin/settings']) {
      await menu(page).locator(`a[href="${href}"]`).click();
    }
    await tabs(page).getByRole('link', { name: /대시보드/ }).click();
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByLabel('열린 업무 목록', { exact: true }).click();
    const popover = page.locator('details[open]');
    await popover.getByRole('link', { name: '업체 관리', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/providers$/);
    await expect(tabs(page).getByRole('link', { name: '업체 관리', exact: true })).toBeInViewport();
    const stripBounds = (await tabs(page).boundingBox())!;
    const activeBounds = (await tabs(page).getByRole('link', { name: '업체 관리', exact: true }).locator('..').boundingBox())!;
    expect(activeBounds.x).toBeGreaterThanOrEqual(stripBounds.x - 1);
    expect(activeBounds.x + activeBounds.width).toBeLessThanOrEqual(stripBounds.x + stripBounds.width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('navigation', { name: '열린 업무' })).toBeHidden();
  });
}

test('손상된 저장 상태와 외부 주소는 무시하고 로그인 화면에서 탭 목록을 초기화한다', async ({ page }) => {
  await page.goto('/admin');
  await page.evaluate(() => sessionStorage.setItem('mijin.admin.workspace.v1', '{broken'));
  await page.reload();
  await expect(tabs(page).getByRole('link')).toHaveCount(1);
  await page.evaluate(() => sessionStorage.setItem('mijin.admin.workspace.v1', JSON.stringify([
    'javascript:alert(1)', '//outside.example/admin', '/admin/login', '/admin/technicians/test/contract/print',
    '/admin/settings', '/admin/settings', '/admin/requests/queue-request-0',
  ])));
  await page.reload();
  await expect(tabs(page).getByRole('link')).toHaveCount(3);
  await expect(tabs(page).getByRole('link', { name: '설정', exact: true })).toHaveAttribute('href', '/admin/settings');
  await page.context().clearCookies();
  await page.goto('/admin/login');
  await expect(page.getByRole('navigation', { name: '열린 업무' })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('mijin.admin.workspace.v1')!))).toEqual(['/admin']);
});
