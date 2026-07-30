import { expect, test, type Page } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';

// 분석 부모 그룹 내비 — 드롭다운·active-parent·ARIA·lg 게이트(768~1023 무변경).

function analyticsNavButton(page: Page) {
  return page.getByRole('navigation', { name: '관리자 이동' }).getByRole('button', { name: '분석' });
}

// dev 서버는 온디맨드 컴파일이라 SSR 마크업이 먼저 그려지고 하이드레이션이 뒤늦게 붙는다.
// 그 사이의 버튼은 Playwright 액션 검사(visible·stable·enabled·이벤트 수신)를 **전부 통과**한다 —
// onClick 핸들러만 아직 없어서 클릭이 조용히 삼켜지고 aria-expanded 가 false 로 남는다.
// 그래서 toBeEnabled() 로는 잡히지 않는다. 실제 사전조건은 "클릭이 메뉴를 열었다"이므로
// 그것을 그대로 조건으로 건다. 이미 열려 있으면 다시 누르지 않아(토글) 재시도가 멱등하다.
async function openAnalyticsMenu(page: Page) {
  const parent = analyticsNavButton(page);
  await expect(async () => {
    if ((await parent.getAttribute('aria-expanded')) !== 'true') await parent.click();
    await expect(parent).toHaveAttribute('aria-expanded', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  return parent;
}

test.describe('관리자 분석 내비 그룹', () => {
  test('① 드롭다운 열고 현황으로 이동, 부모 활성 표시', async ({ page }) => {
    await loginAsAdmin(page);
    await expect(analyticsNavButton(page)).toHaveAttribute('aria-expanded', 'false');
    await openAnalyticsMenu(page);
    await page.getByRole('menuitem', { name: '현황', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/analytics\/dashboard$/);
    // active-parent — 자식 경로에서 부모가 현재 위치로 표시된다.
    await expect(analyticsNavButton(page)).toHaveAttribute('aria-current', 'page');
  });

  test('② Esc 로 드롭다운이 닫힌다', async ({ page }) => {
    await loginAsAdmin(page);
    const parent = await openAnalyticsMenu(page);
    await page.keyboard.press('Escape');
    await expect(parent).toHaveAttribute('aria-expanded', 'false');
  });

  test('③ 768~1023 에서는 분석 그룹이 노출되지 않고 기존 내비는 유지된다', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await loginAsAdmin(page);
    await expect(analyticsNavButton(page)).toBeHidden();
    const nav = page.getByRole('navigation', { name: '관리자 이동' });
    // 업체·전기기사 관리는 승인대기 뱃지 숫자가 링크 안에 함께 렌더되므로(AdminShell.tsx:174-180)
    // 접근성 이름이 "업체 관리 2" 형태가 된다 — 접두 매칭을 유지해야 한다.
    for (const label of ['대시보드', '업체 관리', '전기기사 관리', '순환 현황', '설정']) {
      await expect(nav.getByRole('link', { name: new RegExp(`^${label}`) })).toBeVisible();
    }
    // '정산'(/admin/commissions)과 '정산 집계'(/admin/settlements)는 접두가 겹쳐
    // /^정산/ 이 둘 다 잡아 strict mode 위반이 난다. 각각 정확히 지목한다.
    await expect(nav.getByRole('link', { name: '정산', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: '정산 집계', exact: true })).toBeVisible();
  });

  test('④ 지도 메뉴가 현황 다음에 표시된다', async ({ page }) => {
    await loginAsAdmin(page);
    await openAnalyticsMenu(page);
    const items = page.getByRole('menuitem');
    await expect(items.nth(0)).toHaveText('현황');
    await expect(items.nth(1)).toHaveText('지도');
    await expect(page.getByRole('menuitem', { name: '지도', exact: true })).toHaveAttribute('href', '/admin/analytics/map');
  });
});
