import { expect, test } from '@playwright/test';
import { seedSession } from './helpers/auth';

const LINKS = [
  ['대시보드', '/admin'], ['순환 현황', '/admin/rotation'], ['업체 관리', '/admin/providers'],
  ['전기기사 관리', '/admin/technicians'], ['정산', '/admin/commissions'], ['정산 집계', '/admin/settlements'],
  ['현황', '/admin/analytics/dashboard'], ['지도', '/admin/analytics/map'], ['설문', '/admin/analytics/surveys'],
  ['평점', '/admin/analytics/ratings'], ['설정', '/admin/settings'],
] as const;

test.beforeEach(async ({ page }) => { await seedSession(page.context(), 'ADMIN'); });

test('공통 사이드바에서 모든 관리자 화면 이동과 현재 위치를 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/admin');
  const nav = page.getByRole('navigation', { name: '관리자 이동' });
  for (const [, href] of LINKS) {
    if (href.startsWith('/admin/analytics') && await nav.getByRole('button', { name: '분석' }).getAttribute('aria-expanded') !== 'true') await nav.getByRole('button', { name: '분석' }).click();
    await nav.locator(`a[href="${href}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${href}(?:\\?.*)?$`));
    await expect(nav.locator(`a[href="${href}"]`)).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('complementary', { name: '관리자 메뉴' })).toHaveCSS('width', '184px');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(nav.locator(`a[href="${href}"]`)).toBeVisible();
  }
});

test('분석 하위 메뉴는 키보드로 펼치고 Escape로 접는다', async ({ page }) => {
  await page.goto('/admin');
  const nav = page.getByRole('navigation', { name: '관리자 이동' });
  const toggle = nav.getByRole('button', { name: '분석' });
  await toggle.focus(); await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  await expect(nav.getByRole('link', { name: '현황', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
});

for (const width of [320, 390, 768, 1024]) {
  test(`${width}px 메뉴 서랍의 전체 메뉴·초점·배경 잠금·이동`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/admin');
    const trigger = page.getByRole('button', { name: '관리자 메뉴 열기' });
    await trigger.click();
    const drawer = page.getByRole('dialog', { name: '관리자 메뉴', exact: true });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('button', { name: '관리자 메뉴 닫기' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(drawer.getByRole('button', { name: '로그아웃', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(drawer.getByRole('button', { name: '관리자 메뉴 닫기' })).toBeFocused();
    await drawer.getByRole('button', { name: '분석' }).click();
    for (const [, href] of LINKS) await expect(drawer.getByRole('navigation', {name: '관리자 이동'}).locator(`a[href="${href}"]`)).toBeVisible();
    await drawer.getByRole('link', { name: '설문', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/analytics\/surveys$/);
    await expect(drawer).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
    await trigger.click();
    await drawer.getByRole('button', { name: '관리자 메뉴 닫기' }).focus();
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('계약서 인쇄와 로그인에는 관리자 프레임을 표시하지 않는다', async ({ page }) => {
  await page.goto('/admin');
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('complementary', { name: '관리자 메뉴' })).toBeHidden();
  expect(await page.locator('#admin-content').evaluate(node => getComputedStyle(node).marginLeft)).toBe('0px');
  await page.emulateMedia({ media: 'screen' });
  const response = await page.request.get('/api/admin/technicians');
  const { technicians } = await response.json();
  await page.goto(`/admin/technicians/${technicians[0].id}/contract/print`);
  await expect(page.getByRole('navigation', { name: '관리자 이동' })).toHaveCount(0);
  await expect(page.locator('#admin-content')).toHaveCount(0);
  await page.context().clearCookies();
  await page.goto('/admin/login');
  await expect(page.getByRole('navigation', { name: '관리자 이동' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
});
