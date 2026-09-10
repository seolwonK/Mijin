import { test, expect } from '@playwright/test';
import { seedSession } from './helpers/auth';
import { mockQueue, QUEUE_ROWS, queueDetail, QUEUE_CANDIDATE } from './helpers/admin-queue';

test.beforeEach(async ({ page }) => { await seedSession(page.context(), 'ADMIN'); await mockQueue(page); });

test('목록 4열·전체 내용·연락처·반응형·선택 패널과 키보드 복귀', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/admin');
  const table = page.getByRole('table');
  await expect(table.getByRole('columnheader')).toHaveCount(4);
  await expect(table.locator('tbody tr')).toHaveCount(25);
  await expect(table.getByText(QUEUE_ROWS[0].description, { exact: true })).toBeVisible();
  const before = (await table.boundingBox())!.width;
  const trigger = page.getByRole('button', { name: '접수 900011 선택', exact: true });
  await trigger.focus(); await page.keyboard.press('Enter');
  const panel = page.getByRole('complementary', { name: '선택한 접수' });
  await expect(panel).toBeVisible();
  expect((await table.boundingBox())!.width).toBeLessThan(before);
  await expect(panel.getByText(QUEUE_ROWS[0].description, { exact: true })).toBeVisible();
  await expect(panel.getByRole('link', { name: '01012345678', exact: true })).toHaveAttribute('href', 'tel:01012345678');
  await expect(page.getByText('SELECTED REQUEST')).toHaveCount(0);
  await expect(panel.getByRole('region', { name: '배정 후보' }).locator('ol > li')).toHaveCount(3);
  await panel.getByRole('button', { name: '나머지 후보 2명 보기' }).click();
  await expect(panel.getByRole('region', { name: '배정 후보' }).locator('ol > li')).toHaveCount(5);
  await panel.getByRole('button', { name: '후보 접기', exact: true }).click();
  await expect(panel.getByText('자동배정 예정')).toHaveCount(0);
  for (const width of [320, 390, 768, 1000, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const buttons = panel.getByRole('button', { name: '배정', exact: true });
    expect((await buttons.first().boundingBox())!.width).toBeGreaterThan(45);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await panel.getByRole('button', { name: '선택한 접수 닫기' }).click();
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('페이지 이동·필터·주소와 전화번호 검색·시각 정렬', async ({ page }) => {
  await page.goto('/admin');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await page.getByRole('button', { name: '배정 대기 탭으로 이동' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '이전', exact: true })).toBeDisabled();
  await page.getByRole('group', { name: '접수 상태 필터' }).getByRole('button', { name: /^전체/ }).click();
  await page.getByRole('searchbox', { name: '접수 검색' }).fill('010-1234-5678');
  await expect(page.locator('tbody tr')).toHaveCount(25);
  await page.getByRole('searchbox', { name: '접수 검색' }).fill('12층 고객센터');
  await expect(page.locator('tbody tr')).toHaveCount(25);
  await page.getByRole('searchbox', { name: '접수 검색' }).fill('없는 주소');
  await expect(page.getByText('조건에 해당하는 접수가 없습니다.')).toBeVisible();
  await page.getByRole('searchbox', { name: '접수 검색' }).fill('');
  await page.getByRole('button', { name: '접수 시각' }).click();
  await expect(page.locator('tbody tr').first()).toContainText(QUEUE_ROWS[27].lookupCode);
});

test('접수·후보 조회 실패를 구분하고 재시도 전에는 배정하지 않는다', async ({ page }) => {
  let detailFailed = true;
  let candidateFailed = true;
  await page.route('**/api/admin/requests/queue-request-0', route => detailFailed ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: queueDetail('queue-request-0') }));
  await page.route('**/api/admin/requests/*/candidates', route => candidateFailed ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: { candidates: [QUEUE_CANDIDATE] } }));
  await page.goto('/admin');
  await page.getByRole('button', { name: '접수 900011 선택' }).click();
  const panel = page.getByRole('complementary', { name: '선택한 접수' });
  await expect(panel.getByText('접수 정보를 불러오지 못했습니다.', { exact: true })).toBeVisible();
  detailFailed = false;
  await panel.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect(panel.getByText('배정 후보를 불러오지 못했습니다.', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: '배정', exact: true })).toHaveCount(0);
  candidateFailed = false;
  await panel.getByRole('button', { name: '후보 다시 조회' }).click();
  await expect(panel.getByRole('button', { name: '배정', exact: true })).toBeEnabled();
});

test('배정 확인은 키보드 초점을 유지하고 Escape로 취소한다', async ({ page }) => {
  let sent = 0;
  await page.route('**/api/admin/requests/*/assign', route => { sent++; return route.fulfill({ json: { ok: true } }); });
  await page.goto('/admin');
  await page.getByRole('button', { name: '접수 900011 선택' }).click();
  const assign = page.getByRole('complementary', { name: '선택한 접수' }).getByRole('button', { name: '배정', exact: true }).first();
  await assign.click();
  const dialog = page.getByRole('dialog', { name: '배정 확인' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '취소', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '배정', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: '취소', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(sent).toBe(0);
  await expect(assign).toBeFocused();
});

test('첫 접수 위치·내용 펼치기·갱신 후 펼침 유지·독립 스크롤', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/admin');
  const row = page.locator('tbody tr').first();
  expect((await row.boundingBox())!.y).toBeLessThanOrEqual(300);
  const expand = row.getByRole('button', { name: '접수 900011 내용 펼치기' });
  await expect(expand).toBeVisible();
  const height = (await row.boundingBox())!.height;
  await expand.click();
  await expect(row.getByRole('button', { name: '접수 900011 내용 접기' })).toHaveAttribute('aria-expanded', 'true');
  expect((await row.boundingBox())!.height).toBeGreaterThan(height);
  await page.getByRole('button', { name: '새로고침', exact: true }).click();
  await expect(row.getByRole('button', { name: '접수 900011 내용 접기' })).toHaveAttribute('aria-expanded', 'true');
  const list = page.getByRole('region', { name: '접수 목록 스크롤' });
  await list.evaluate(node => { node.scrollTop = 400; });
  const position = await list.evaluate(node => node.scrollTop);
  const selection = page.locator('tbody tr').nth(7).getByRole('button', { name: /선택$/ });
  await selection.scrollIntoViewIfNeeded();
  const rowPosition = (await selection.boundingBox())!.y;
  await selection.click();
  await page.getByRole('button', { name: '선택한 접수 닫기' }).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: '접수 상세 패널', exact: true })).toHaveCount(0);
  // Width changes reflow the expanded text; keep the visible row anchored, not its raw scroll offset.
  expect(Math.abs((await selection.boundingBox())!.y - rowPosition)).toBeLessThanOrEqual(2);
  expect(position).toBeGreaterThan(0);
  await expect(selection).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

for (const width of [390, 1000, 1280]) {
  test(`${width}px 상세 모달의 배경 차단·중첩 확인창 취소·목록 복귀`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let sent = 0;
    await page.route('**/api/admin/requests/*/assign', route => { sent++; return route.fulfill({ json: { ok: true } }); });
    await page.goto('/admin');
    const trigger = page.getByRole('button', { name: '접수 900011 선택', exact: true });
    await trigger.click();
    const drawer = page.getByRole('dialog', { name: '접수 상세 패널', exact: true });
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute('aria-modal', 'true');
    expect(await drawer.evaluate(node => node.matches(':modal'))).toBe(true);
    await page.getByRole('button', { name: '새로고침', exact: true }).focus();
    await expect(page.getByRole('button', { name: '새로고침', exact: true })).not.toBeFocused();
    const assign = drawer.getByRole('button', { name: '배정', exact: true }).first();
    await assign.click();
    const confirm = page.getByRole('dialog', { name: '배정 확인', exact: true });
    await expect(confirm).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);
    await expect(drawer).toBeVisible();
    await expect(assign).toBeFocused();
    expect(sent).toBe(0);
    await drawer.getByRole('button', { name: '선택한 접수 닫기' }).focus();
    await page.keyboard.press('Shift+Tab');
    await expect(drawer.getByRole('link', { name: /상세 열기/ })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  });
}
