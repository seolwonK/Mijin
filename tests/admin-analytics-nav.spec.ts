import { expect, test, type Page } from '@playwright/test';

// 분석 부모 그룹 내비 — 드롭다운·active-parent·ARIA·lg 게이트(768~1023 무변경).

async function login(page: Page) {
  await page.goto('/admin/login');
  await page.locator('#loginId').fill('admin');
  await page.locator('#password').fill('admin1234');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

function analyticsNavButton(page: Page) {
  return page.getByRole('navigation', { name: '관리자 이동' }).getByRole('button', { name: '분석' });
}

test.describe('관리자 분석 내비 그룹', () => {
  test('① 드롭다운 열고 현황으로 이동, 부모 활성 표시', async ({ page }) => {
    await login(page);
    const parent = analyticsNavButton(page);
    await expect(parent).toHaveAttribute('aria-expanded', 'false');
    await parent.click();
    await expect(parent).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('menuitem', { name: '현황', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/analytics\/dashboard$/);
    // active-parent — 자식 경로에서 부모가 현재 위치로 표시된다.
    await expect(analyticsNavButton(page)).toHaveAttribute('aria-current', 'page');
  });

  test('② Esc 로 드롭다운이 닫힌다', async ({ page }) => {
    await login(page);
    const parent = analyticsNavButton(page);
    await parent.click();
    await expect(parent).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(parent).toHaveAttribute('aria-expanded', 'false');
  });

  test('③ 768~1023 에서는 분석 그룹이 노출되지 않고 기존 내비는 유지된다', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await login(page);
    await expect(analyticsNavButton(page)).toBeHidden();
    const nav = page.getByRole('navigation', { name: '관리자 이동' });
    for (const label of ['대시보드', '업체 관리', '기술자 관리', '순환 현황', '정산', '설정']) {
      await expect(nav.getByRole('link', { name: new RegExp(`^${label}`) })).toBeVisible();
    }
  });

  test('④ 지도 메뉴가 현황 다음에 표시된다', async ({ page }) => {
    await login(page);
    await analyticsNavButton(page).click();
    const items = page.getByRole('menuitem');
    await expect(items.nth(0)).toHaveText('현황');
    await expect(items.nth(1)).toHaveText('지도');
    await expect(page.getByRole('menuitem', { name: '지도', exact: true })).toHaveAttribute('href', '/admin/analytics/map');
  });
});
