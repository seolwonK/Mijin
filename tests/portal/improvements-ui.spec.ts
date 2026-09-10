import { test, expect, type Page } from '@playwright/test';
import { seedSession } from '../helpers/auth';
import { CERT_PNG } from '../partner/helpers';
const job = (status = 'REQUESTED') => ({
  id: 'portal-job',
  status,
  createdAt: new Date().toISOString(),
  distanceKm: 3.2,
  rejectReason: null,
  request: {
    id: 'portal-request',
    status: 'ASSIGNED',
    urgency: 'URGENT',
    description: '매장 분전반에서 소리가 나고 전등이 깜빡입니다.',
    address: '서울특별시 강남구 테헤란로 152 긴 건물 이름 1201호',
    customerName: '테스트 고객',
    customerPhone: '01012345678',
    lat: 37.5,
    lng: 127,
    createdAt: new Date().toISOString(),
    photos: [
      { id: 'photo-1', mime: 'image/png' },
      { id: 'photo-2', mime: 'image/png' },
    ],
  },
});
async function homeMocks(page: Page, scope: string) {
  await page.route(`**/api/${scope}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    const key = path.split('/').at(-1);
    const bodies: Record<string, unknown> = {
      jobs: {
        jobs: [job(), { ...job('EXPIRED'), id: 'old-job' }],
        totalPast: 1,
        nextCursor: null,
      },
      stats: {
        assigned30d: 12,
        accepted30d: 10,
        avgRating: 4.8,
        reviewCount: 5,
      },
      commissions: {
        pendingTotal: 123456789,
        paidTotal: 987654321,
        totalCount: 1,
        nextCursor: null,
        entries: [
          {
            id: 'entry-1',
            refereeName: '전기 점검 업체',
            refereeType: '업체',
            amount: 123456789,
            status: 'PENDING',
            createdAt: new Date().toISOString(),
          },
        ],
      },
      eggs: { balance: 5, rank: null, poolSize: 3, eligible: false },
      referrals: {
        referees: [],
        totals: { refereeCount: 0, pendingSurveyCount: 0 },
      },
      reviews: {
        reviewCount: 5,
        avgRating: 4.8,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 4 },
        comments: [{ rating: 5, comment: '시간을 지켜 방문해 주셨어요.' }],
      },
      contract: { contract: { status: 'DRAFT' } },
    };
    return route.fulfill({ json: bodies[key!] ?? job() });
  });
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
for (const scope of ['partner', 'tech'] as const) {
  test.describe(scope, () => {
    test.beforeEach(async ({ context, page }) => {
      await seedSession(
        context,
        scope === 'partner' ? 'PROVIDER' : 'TECHNICIAN',
        {
          userId: 'portal-ui',
          ...(scope === 'partner'
            ? { providerId: 'portal-ui' }
            : { technicianId: 'portal-ui' }),
        },
      );
      await page.setViewportSize({ width: 390, height: 844 });
    });
    test('모바일 우선순위·9자리 금액·상태와 접근성', async ({ page }, info) => {
      await homeMocks(page, scope);
      let detailRequests = 0;
      page.on('request', (req) => {
        if (/\/jobs\/[^/?]+$/.test(req.url())) detailRequests++;
      });
      await page.goto(`/${scope}`);
      await expect(
        page.getByRole('heading', { name: '응답 대기 1' }),
      ).toBeVisible();
      await expect(page.getByText(/응답 시간 .*분 남음/)).toBeVisible();
      await expect(
        page.getByRole('link', { name: '고객에게 전화' }),
      ).toHaveAttribute('href', 'tel:01012345678');
      await expect(page.getByText('배정 대상 아님')).toBeVisible();
      expect(detailRequests).toBe(0);
      const waiting = await page
        .getByRole('heading', { name: '응답 대기 1' })
        .boundingBox();
      const eggs = await page.getByText('내 알', { exact: true }).boundingBox();
      expect(eggs!.y).toBeLessThan(waiting!.y);
      if (scope === 'tech') {
        const ct = await page.getByText('근로확인서 작성 필요 →').boundingBox();
        expect(ct!.y).toBeLessThan(waiting!.y);
      }
      await noOverflow(page);
      for (const width of [320, 360, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await noOverflow(page);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.addScriptTag({ path: require.resolve('axe-core') });
      const issues = await page.evaluate(async () => {
        const axe = (
          window as unknown as {
            axe: {
              run: () => Promise<{
                violations: {
                  id: string;
                  impact: string | null;
                  nodes: unknown[];
                }[];
              }>;
            };
          }
        ).axe;
        return (await axe.run()).violations
          .filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
          .map((v) => ({ id: v.id, count: v.nodes.length }));
      });
      expect(issues).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`${scope}-home-mobile.png`),
        fullPage: true,
      });
    });
    test('조회 실패는 빈 내역으로 표시하지 않고 전체 새로고침으로 복구', async ({
      page,
    }) => {
      await homeMocks(page, scope);
      let broken = true;
      let requests = 0;
      await page.route(`**/api/${scope}/referrals`, (route) => {
        requests++;
        return broken
          ? route.fulfill({ status: 503, json: { error: 'offline' } })
          : route.fulfill({
              json: {
                referees: [],
                totals: { refereeCount: 0, pendingSurveyCount: 0 },
              },
            });
      });
      await page.goto(`/${scope}`);
      await expect(
        page.getByText(/내 추천 현황을 불러오지 못했습니다/),
      ).toBeVisible();
      await expect(
        page.getByText('아직 추천한 업체·전기기사가 없습니다'),
      ).toHaveCount(0);
      broken = false;
      const count = requests;
      await page.getByRole('button', { name: '전체 새로고침' }).click();
      await expect(
        page.getByText('아직 추천한 업체·전기기사가 없습니다'),
      ).toBeVisible();
      expect(requests).toBeGreaterThan(count);
    });
    test('상세 통신 실패에도 연락처 유지·처리 버튼 잠금·복구', async ({
      page,
    }) => {
      let broken = false;
      await page.route(`**/api/${scope}/jobs/portal-job`, (route) =>
        broken
          ? route.fulfill({ status: 503, json: {} })
          : route.fulfill({ json: job() }),
      );
      await page.goto(`/${scope}/jobs/portal-job`);
      await expect(
        page.getByRole('button', { name: '수락하기' }),
      ).toBeEnabled();
      broken = true;
      await page.evaluate(() =>
        document.dispatchEvent(new Event('visibilitychange')),
      );
      await expect(
        page.getByText('배정 상세의 최신 정보를 가져오지 못했습니다'),
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: '01012345678' }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: '수락하기' }),
      ).toBeDisabled();
      broken = false;
      await page.getByRole('button', { name: '다시 시도' }).click();
      await expect(
        page.getByRole('button', { name: '수락하기' }),
      ).toBeEnabled();
      await noOverflow(page);
    });
    test('사진 대화상자 키보드 이동·초점 복귀·이미지 재시도', async ({
      page,
    }) => {
      await page.route(`**/api/${scope}/jobs/portal-job`, (route) =>
        route.fulfill({ json: job() }),
      );
      let broken = true;
      await page.route('**/api/requests/portal-request/photos/**', (route) =>
        broken
          ? route.fulfill({ status: 503, body: '' })
          : route.fulfill({ contentType: 'image/png', body: CERT_PNG }),
      );
      await page.goto(`/${scope}/jobs/portal-job`);
      const trigger = page.getByRole('button', {
        name: '고객 첨부 사진 1 크게 보기',
      });
      await trigger.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('button', { name: '닫기' })).toBeFocused();
      expect(await page.evaluate(() => document.body.style.overflow)).toBe(
        'hidden',
      );
      await page.keyboard.press('Shift+Tab');
      expect(
        await page.evaluate(() =>
          document.querySelector('dialog')?.contains(document.activeElement),
        ),
      ).toBe(true);
      broken = false;
      await dialog.getByRole('button', { name: '사진 다시 시도' }).click();
      await expect(dialog.getByRole('img')).toBeVisible();
      await page.keyboard.press('ArrowRight');
      await expect(dialog).toHaveAttribute(
        'aria-label',
        '고객 첨부 사진 2 / 2',
      );
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
      await trigger.click();
      await expect(dialog).toBeVisible();
      await page.route(`**/api/${scope}/jobs/portal-job`, (route) =>
        route.fulfill({
          json: { ...job(), request: { ...job().request, photos: [] } },
        }),
      );
      await page.evaluate(() =>
        document.dispatchEvent(new Event('visibilitychange')),
      );
      await expect(dialog).toHaveCount(0);
      expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    });
    test('내 정보 재시도·미저장 상태·저장 실패 후 입력 유지', async ({
      page,
    }, info) => {
      let loadFail = true,
        saveFail = true;
      const profile = {
        loginId: 'sample',
        name: '테스트 계정',
        phone: '01012345678',
        address: '서울특별시 강남구 테헤란로 1',
        regions: [],
        isActive: true,
        approvalStatus: 'APPROVED',
      };
      await page.route(`**/api/${scope}/profile`, (route) =>
        route.request().method() === 'PATCH'
          ? route.fulfill({
              status: saveFail ? 503 : 200,
              json: saveFail
                ? { error: '잠시 후 다시 시도해 주세요' }
                : { ok: true },
            })
          : route.fulfill({
              status: loadFail ? 503 : 200,
              json: loadFail ? { error: '조회 실패' } : profile,
            }),
      );
      await page.goto(`/${scope}/profile`);
      await expect(
        page.getByRole('button', { name: '다시 시도' }),
      ).toBeVisible();
      loadFail = false;
      await page.getByRole('button', { name: '다시 시도' }).click();
      await expect(page.getByLabel('배정 연락처')).toHaveValue('01012345678');
      await page.getByRole('switch').click();
      await expect(
        page.getByText('아직 저장하지 않은 변경사항이 있습니다.'),
      ).toBeVisible();
      await page.getByRole('button', { name: '저장하기' }).click();
      await expect(page.getByText('잠시 후 다시 시도해 주세요')).toBeVisible();
      await expect(page.getByRole('switch')).toHaveAttribute(
        'aria-checked',
        'false',
      );
      saveFail = false;
      await page.getByRole('button', { name: '저장하기' }).click();
      await expect(
        page.getByText('저장되었습니다. 배정 설정에 적용했습니다.'),
      ).toBeVisible();
      await noOverflow(page);
      await page.screenshot({
        path: info.outputPath(`${scope}-profile-mobile.png`),
        fullPage: true,
      });
    });
    test('지난 내역 검색과 페이지 이동', async ({ page }) => {
      await page.route(`**/api/${scope}/jobs?**`, (route) => {
        const p = new URL(route.request().url()).searchParams;
        return route.fulfill({
          json: {
            jobs: p.get('q')
              ? []
              : [
                  {
                    ...job('REJECTED'),
                    id: p.get('cursor') ? 'second' : 'first',
                  },
                ],
            totalPast: p.get('q') ? 0 : 21,
            nextCursor: p.get('cursor') || p.get('q') ? null : 'page-two',
          },
        });
      });
      await page.goto(`/${scope}/history`);
      await expect(page.getByText('총 21건 · 1페이지')).toBeVisible();
      await page.getByRole('button', { name: '다음 페이지' }).click();
      await expect(
        page.locator(`a[href="/${scope}/jobs/second"]`),
      ).toBeVisible();
      await page.getByRole('button', { name: '이전 페이지' }).click();
      await expect(
        page.locator(`a[href="/${scope}/jobs/first"]`),
      ).toBeVisible();
      await page.getByLabel('주소·고장 내용·고객명 검색').fill('없는주소');
      await page.getByRole('button', { name: '검색', exact: true }).click();
      await expect(
        page.getByText(/조건에 맞는 배정 내역이 없습니다/),
      ).toBeVisible();
    });
  });
}
test('아이디 확인 요청 중 수정하면 이전 성공 응답은 무효', async ({ page }) => {
  let respond!: () => void;
  await page.route('**/api/auth/check-login-id?**', async (route) => {
    await new Promise<void>((resolve) => {
      respond = resolve;
    });
    await route.fulfill({ json: { available: true } });
  });
  await page.goto('/partner/signup');
  const id = page.getByLabel('로그인 아이디');
  await id.fill('old-id');
  const pending = page.waitForRequest('**/api/auth/check-login-id?**');
  await page.getByRole('button', { name: '중복 확인' }).click();
  await pending;
  await id.fill('new-id');
  respond();
  await page.waitForResponse('**/api/auth/check-login-id?**');
  await expect(page.getByText('사용할 수 있는 아이디입니다')).toHaveCount(0);
  await page.getByRole('button', { name: '가입 신청하기' }).click();
  await expect(id).toBeFocused();
  await expect(id).toHaveAttribute('aria-invalid', 'true');
});
test('가입 필드 라벨·첨부 키보드 포커스·고용 선택 상태', async ({ page }) => {
  await page.goto('/partner/signup');
  await page.getByRole('button', { name: '가입 신청하기' }).click();
  await expect(page.getByLabel('로그인 아이디')).toBeFocused();
  const upload = page.getByLabel('사업자등록증 첨부');
  await upload.focus();
  await expect(upload).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('전기공사업 등록증 첨부')).toBeFocused();
  await page.goto('/tech/signup');
  await page.getByRole('button', { name: /일일 근로자/ }).click();
  await expect(
    page.getByRole('button', { name: /일일 근로자/ }),
  ).toHaveAttribute('aria-pressed', 'true');
});
test('근로확인서 전체 조건·키보드 서명·완료본 인쇄', async ({
  page,
  context,
}, info) => {
  await seedSession(context, 'TECHNICIAN', {
    userId: 'portal-ui',
    technicianId: 'portal-ui',
  });
  let contract = {
    status: 'DRAFT',
    employmentType: 'DAILY',
    updatedAt: '2026-09-10T00:00:00.000Z',
    contractStartDate: '2026-09-10',
    contractEndDate: null,
    workLocation: '고객 현장',
    jobDescription: '전기 점검',
    workerAddress: '서울특별시 강남구',
    workerSignatureName: '테스트 기사',
    workStartTime: '09:00',
    workEndTime: '18:00',
    breakStartTime: '12:00',
    breakEndTime: '13:00',
    hoursNote: '1일 소정근로 8시간',
    workDays: '근로개시일 당일',
    weeklyHoliday: null,
    wageType: 'DAILY',
    wageAmount: 150000,
    payDate: '근로 당일',
    payMethod: 'BANK_TRANSFER',
    bonusExists: false,
    otherPayExists: false,
    insuranceEmployment: true,
    insuranceAccident: true,
    insurancePension: false,
    insuranceHealth: false,
    annualLeaveNote: '근로기준법에 따라 부여',
    workerSignatureDataUrl: null as string | null,
    signedAt: null as string | null,
  };
  await page.route('**/api/tech/contract', (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      expect(body.version).toBe(contract.updatedAt);
      expect(body.workerSignatureDataUrl).toMatch(/^data:image\/png;base64,/);
      contract = {
        ...contract,
        ...body,
        status: 'CONFIRMED',
        signedAt: '2026-09-10T00:01:00.000Z',
      };
    }
    return route.fulfill({ json: { contract } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tech/contract');
  await expect(page.getByText('소정근로시간 · 휴게')).toBeVisible();
  await expect(
    page.getByText('09:00 ~ 18:00 (휴게 12:00 ~ 13:00) 1일 소정근로 8시간'),
  ).toBeVisible();
  await expect(page.getByLabel('근로개시일')).toHaveValue('2026-09-10');
  await page.getByRole('radio', { name: '이름 입력하기' }).check();
  await page.getByLabel('서명에 사용할 성명').fill('테스트 기사');
  await page
    .getByRole('checkbox', { name: '입력한 이름을 내 서명으로 사용합니다.' })
    .check();
  const apply = page.getByRole('button', { name: '이름으로 서명 적용' });
  await apply.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('서명됨', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '서명하고 완료' }).click();
  await expect(page.getByRole('img', { name: '내 서명' })).toBeVisible();
  await expect(page.getByLabel('근로개시일')).toBeDisabled();
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath('contract-confirmed-mobile.png'),
    fullPage: true,
  });
  await page.evaluate(() => {
    window.print = () => {
      document.body.dataset.printRequested = 'true';
    };
  });
  await page
    .getByRole('button', { name: '근로확인서 인쇄 · PDF 저장' })
    .click();
  expect(await page.locator('body').getAttribute('data-print-requested')).toBe(
    'true',
  );
  await page.emulateMedia({ media: 'print' });
  await expect(
    page.getByRole('button', { name: '근로확인서 인쇄 · PDF 저장' }),
  ).toBeHidden();
  await expect(page.getByText('테스트 기사', { exact: true })).toBeVisible();
  await page.screenshot({
    path: info.outputPath('contract-print.png'),
    fullPage: true,
  });
});
for (const scope of ['partner', 'tech'] as const) {
  test(`${scope}: 모든 조회 실패와 계약 오류는 빈 상태로 오인하지 않는다`, async ({
    page,
    context,
  }) => {
    await seedSession(
      context,
      scope === 'partner' ? 'PROVIDER' : 'TECHNICIAN',
      {
        userId: 'portal-ui',
        ...(scope === 'partner'
          ? { providerId: 'portal-ui' }
          : { technicianId: 'portal-ui' }),
      },
    );
    await page.route(`**/api/${scope}/**`, (route) =>
      route.fulfill({ status: 503, json: {} }),
    );
    await page.goto(`/${scope}`);
    for (const label of [
      '배정 목록',
      '내 성과',
      '소개 수수료',
      '내 알',
      '내 추천 현황',
      '받은 후기',
      ...(scope === 'tech' ? ['근로확인서'] : []),
    ]) {
      await expect(
        page.getByText(`${label}을 불러오지 못했습니다`),
      ).toBeVisible();
    }
    await expect(page.getByText('새로 배정된 건이 없습니다.')).toHaveCount(0);
    await expect(page.getByText('아직 받은 후기가 없습니다')).toHaveCount(0);
  });
  test(`${scope}: 종료된 배정은 사유와 시간을 표시하고 처리 버튼을 숨긴다`, async ({
    page,
    context,
  }) => {
    await seedSession(
      context,
      scope === 'partner' ? 'PROVIDER' : 'TECHNICIAN',
      {
        userId: 'portal-ui',
        ...(scope === 'partner'
          ? { providerId: 'portal-ui' }
          : { technicianId: 'portal-ui' }),
      },
    );
    for (const [status, label] of [
      ['REJECTED', '거절한 배정'],
      ['EXPIRED', '응답 기한 만료'],
      ['CANCELED', '배정 취소'],
    ]) {
      await page.route(`**/api/${scope}/jobs/${status}`, (route) =>
        route.fulfill({
          json: { ...job(status), respondedAt: '2026-09-10T00:10:00.000Z' },
        }),
      );
      await page.goto(`/${scope}/jobs/${status}`);
      await expect(page.getByText(label, { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '수락하기' })).toHaveCount(
        0,
      );
      await expect(page.getByText(/배정 (응답|종료) 2026/)).toBeVisible();
    }
  });
  test(`${scope}: 로그아웃 실패는 현재 화면에서 재시도`, async ({
    page,
    context,
  }) => {
    await seedSession(
      context,
      scope === 'partner' ? 'PROVIDER' : 'TECHNICIAN',
      {
        userId: 'portal-ui',
        ...(scope === 'partner'
          ? { providerId: 'portal-ui' }
          : { technicianId: 'portal-ui' }),
      },
    );
    await homeMocks(page, scope);
    let fail = true;
    await page.route('**/api/auth/logout', (route) =>
      route.fulfill({ status: fail ? 503 : 200, json: { ok: !fail } }),
    );
    await page.goto(`/${scope}`);
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await expect(
      page.getByText('로그아웃하지 못했습니다. 다시 시도해 주세요.'),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/${scope}$`));
    fail = false;
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${scope}/login$`));
  });
}
for (const scope of ['partner', 'tech'] as const) {
  test(`${scope}: 내 정보 세션 만료 시 돌아올 주소를 유지`, async ({
    page,
    context,
  }) => {
    await seedSession(
      context,
      scope === 'partner' ? 'PROVIDER' : 'TECHNICIAN',
      {
        userId: 'portal-ui',
        ...(scope === 'partner'
          ? { providerId: 'portal-ui' }
          : { technicianId: 'portal-ui' }),
      },
    );
    await page.route(`**/api/${scope}/profile`, (route) =>
      route.fulfill({ status: 401, json: { error: '권한이 없습니다' } }),
    );
    await page.goto(`/${scope}/profile`);
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === `/${scope}/login` &&
        url.searchParams.get('returnTo') === `/${scope}/profile`,
    );
  });
  test(`${scope}: 주소 이력 링크의 검색어가 검색 화면에 유지`, async ({
    page,
    context,
  }) => {
    await seedSession(
      context,
      scope === 'partner' ? 'PROVIDER' : 'TECHNICIAN',
      {
        userId: 'portal-ui',
        ...(scope === 'partner'
          ? { providerId: 'portal-ui' }
          : { technicianId: 'portal-ui' }),
      },
    );
    await homeMocks(page, scope);
    const address = '서울특별시 강남구 테헤란로 152 긴 건물 이름 1201호';
    await page.goto(`/${scope}/history?q=${encodeURIComponent(address)}`);
    await expect(page.getByLabel('주소·고장 내용·고객명 검색')).toHaveValue(
      address,
    );
  });
}
