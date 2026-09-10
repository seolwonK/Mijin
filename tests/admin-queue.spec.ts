import { expect, test, type Page } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';
import { mockQueue } from './helpers/admin-queue';

const REQUEST_CODE = '900011';
const CANDIDATE = {
  kind: 'PROVIDER',
  id: 'queue-test-provider',
  key: 'PROVIDER:queue-test-provider',
  name: '큐 테스트 업체',
  phone: '01000000001',
  address: '서울 강남구 테헤란로 1',
  regions: [],
  isActive: true,
  distanceKm: 1,
  coversRegion: true,
  rejectedThisRequest: false,
  assigned30d: 0,
  avgRating: 5,
  reviewCount: 1, eggBalance: 30, sameDistrict: true,
};


function requestRow(page: Page) {
  return page.locator('table tbody tr').filter({ hasText: REQUEST_CODE });
}

async function selectRequest(page: Page) {
  const row = requestRow(page);
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: /선택$/ }).click();
}

async function mockCandidates(page: Page) {
  await page.route('**/api/admin/requests/*/candidates', (route) =>
    route.fulfill({ json: { candidates: [CANDIDATE], hasCoords: true } }),
  );
}

async function openAssignConfirm(page: Page) {
  await selectRequest(page);
  await page.getByRole('button', { name: '배정', exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: '배정 확인', exact: true })).toBeVisible();
}

test.describe('관리자 작업 큐 배정', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockQueue(page);
  });
  test('① 선택 전에는 후보 API를 호출하지 않는다', async ({ page }) => {
    let candidateCalls = 0;
    page.on('request', (request) => {
      if (/\/api\/admin\/requests\/[^/]+\/candidates$/.test(request.url())) candidateCalls += 1;
    });

    await loginAsAdmin(page);
    await expect(requestRow(page)).toHaveCount(1);
    expect(candidateCalls).toBe(0);
  });

  test('② 행 선택은 해당 접수 id의 후보 상세를 조회한다', async ({ page }) => {
    const candidateUrls: string[] = [];
    page.on('request', (request) => {
      if (/\/api\/admin\/requests\/[^/]+\/candidates$/.test(request.url())) {
        candidateUrls.push(request.url());
      }
    });

    await loginAsAdmin(page);
    await selectRequest(page);
    await expect.poll(() => candidateUrls.length).toBeGreaterThan(0);
    expect(candidateUrls).toContainEqual(expect.stringMatching(/\/api\/admin\/requests\/[^/]+\/candidates$/));
    // 단일 마운트 계약: 선택 직후(첫 폴링 주기 15s 이내) 후보 호출은 정확히 1회여야 한다 —
    // 패널이 반응형 분기에 이중 마운트되면 즉시 2회가 되어 여기서 잡힌다.
    await page.waitForTimeout(2_000);
    expect(candidateUrls.length).toBe(1);
  });

  test('③ 빠르게 다른 행을 선택해도 이전 후보를 표시하지 않는다', async ({ page }) => {
    await page.route(`**/api/admin/requests/*/candidates`, async (route) => {
      const id = route.request().url().split('/').at(-2);
      if (id) await new Promise((resolve) => setTimeout(resolve, 250));
      await route.fulfill({ json: { candidates: [{ ...CANDIDATE, name: '이전 후보' }], hasCoords: true } });
    });

    await loginAsAdmin(page);
    await selectRequest(page);
    const otherRow = page.locator('table tbody tr').filter({ hasNotText: REQUEST_CODE }).first();
    await expect(otherRow).toBeVisible();
    await otherRow.getByRole('button', { name: /선택$/ }).click();
    await expect(page.getByText('이전 후보', { exact: true })).toHaveCount(0);
  });

  test('④ 배정 요청은 기존 assigneeKind/assigneeId body를 유지한다', async ({ page }) => {
    let assignBody: unknown;
    await mockCandidates(page);
    await page.route('**/api/admin/requests/*/assign', async (route) => {
      assignBody = route.request().postDataJSON();
      await route.fulfill({ status: 409, json: { error: '이미 배정되었습니다' } });
    });

    await loginAsAdmin(page);
    await openAssignConfirm(page);
    await page.getByRole('dialog', { name: '배정 확인', exact: true }).getByRole('button', { name: '배정', exact: true }).click();
    await expect.poll(() => assignBody).toEqual({ assigneeKind: CANDIDATE.kind, assigneeId: CANDIDATE.id });
  });

  test('⑤ 확인 창에서 취소하면 배정 요청을 보내지 않는다', async ({ page }) => {
    let assignCalls = 0;
    await mockCandidates(page);
    await page.route('**/api/admin/requests/*/assign', (route) => {
      assignCalls += 1;
      return route.fulfill({ json: { ok: true } });
    });

    await loginAsAdmin(page);
    await openAssignConfirm(page);
    await page.getByRole('dialog', { name: '배정 확인', exact: true }).getByRole('button', { name: '취소', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '배정 확인', exact: true })).toHaveCount(0);
    expect(assignCalls).toBe(0);
  });

  test('⑥ 배정 확인을 빠르게 두 번 눌러도 요청은 한 번이다', async ({ page }) => {
    let assignCalls = 0;
    await mockCandidates(page);
    await page.route('**/api/admin/requests/*/assign', async (route) => {
      assignCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 100));
      await route.fulfill({ json: { ok: true } });
    });

    await loginAsAdmin(page);
    await openAssignConfirm(page);
    const confirm = page.getByRole('dialog', { name: '배정 확인', exact: true }).getByRole('button', { name: '배정', exact: true });
    await confirm.dblclick();
    await expect.poll(() => assignCalls).toBe(1);
  });

  test('⑦ 409 배정 충돌 오류를 표시한다', async ({ page }) => {
    await mockCandidates(page);
    await page.route('**/api/admin/requests/*/assign', (route) =>
      route.fulfill({ status: 409, json: { error: '이미 배정되었습니다' } }),
    );

    await loginAsAdmin(page);
    await openAssignConfirm(page);
    await page.getByRole('dialog', { name: '배정 확인', exact: true }).getByRole('button', { name: '배정', exact: true }).click();
    await expect(page.getByText('이미 배정되었습니다', { exact: true })).toBeVisible();
  });

  test('⑧ 배정 성공 뒤 작업 큐를 새로고침한다', async ({ page }) => {
    let queueRefreshes = 0;
    await mockCandidates(page);
    await page.route('**/api/admin/requests/*/assign', (route) => route.fulfill({ json: { ok: true } }));
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/admin/requests') queueRefreshes += 1;
    });

    await loginAsAdmin(page);
    await openAssignConfirm(page);
    const beforeAssign = queueRefreshes;
    await page.getByRole('dialog', { name: '배정 확인', exact: true }).getByRole('button', { name: '배정', exact: true }).click();
    await expect.poll(() => queueRefreshes).toBeGreaterThan(beforeAssign);
  });
});
