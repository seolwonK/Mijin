import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { loginAsTech } from '../helpers/auth';
import { ipHeaders } from '../helpers/ip';
import { FixtureFactory, ephemeralLoginId, ephemeralPhone } from '../helpers/fixtures';

// ───────────────────────────────────────────────────────────────────────────
// 전기기사 UI 종단 여정 (계획 5e)
//   가입(본인인증 포함) → 로그아웃 → 로그인 → 근로확인서 서명 → 수락 → 출동 → 완료
//
// 계약 층(다른 4개 스펙)이 상태코드를 단언한다면, 여기서는 **사용자가 실제로
// 화면에서 그 값을 얻는지**를 단언한다. 두 층이 겹치는 것은 의도된 것이다.
//
// 레이트리밋: 이 파일은 identity/verify·tech/signup 을 브라우저에서 태우므로
// 공용 'ui-default' 버킷을 쓰지 않고 전용 IP 를 쓴다(playwright.config.ts:21 덮어쓰기).
// ───────────────────────────────────────────────────────────────────────────

test.use({ extraHTTPHeaders: ipHeaders('tech-journey') });

const prisma = new PrismaClient();
test.afterAll(async () => prisma.$disconnect());

let f: FixtureFactory;
test.beforeEach(() => {
  f = new FixtureFactory(prisma);
});
test.afterEach(async () => {
  await f.cleanupAll();
});

test('가입 → 로그인 → 계약 서명 → 수락 → 출동 → 완료', async ({ page }) => {
  test.setTimeout(150_000);

  const loginId = ephemeralLoginId('journey');
  const password = 'e2epass1234';
  const phone = ephemeralPhone();
  const name = 'E2E 여정전기기사';

  // ── ① 가입 (휴대폰 본인인증 → 즉시 APPROVED + 자동 로그인) ───────────────
  await page.goto('/tech/signup');
  await page.locator('#tech-loginId').fill(loginId);
  // 아이디 중복 확인이 통과돼야 제출이 허용된다
  await page.getByRole('button', { name: '중복 확인' }).click();
  await expect(page.getByText('사용할 수 있는 아이디입니다')).toBeVisible();
  await page.locator('#tech-password').fill(password);
  await page.locator('#tech-password-confirm').fill(password);
  // exact:true 가 필수다 — ReferrerField 의 '추천인 전화번호'(:104)가 부분일치로 함께 잡힌다.
  await page.getByLabel('성명', { exact: true }).fill(name);
  await page.getByLabel('전화번호', { exact: true }).fill(phone);

  await page.getByRole('button', { name: '본인인증', exact: true }).click();
  await expect(page.getByText('휴대폰 본인인증 완료')).toBeVisible();
  // 인증 후 이름·번호는 대행사 검증값으로 잠긴다.
  await expect(page.getByLabel('성명', { exact: true })).toHaveAttribute('readonly', '');

  await page.getByRole('button', { name: /일일 근로자/ }).click();

  // 거주 지역 — 상세 주소 입력칸을 품은 섹션의 select 2개가 RegionSelect 다.
  const infoSection = page.locator('section').filter({ has: page.locator('#tech-addr') });
  await infoSection.locator('select').first().selectOption('서울특별시');
  await infoSection.locator('select').nth(1).selectOption('강남구');
  await page.locator('#tech-addr').fill('테헤란로 1');

  await page.locator('input[type="checkbox"]').first().check();
  await page.getByRole('button', { name: '가입 신청하기' }).click();

  await expect(page.getByRole('heading', { name: '가입이 완료되었습니다' })).toBeVisible();
  // 화면이 약속하는 것: 승인 대기가 아니라 **자동 로그인 + 근로확인서 서명 안내**.
  await expect(page.getByText('자동으로 로그인되었습니다.')).toBeVisible();

  const user = await prisma.user.findUnique({
    where: { loginId },
    select: { id: true, name: true, technician: { select: { id: true, approvalStatus: true } } },
  });
  expect(user).not.toBeNull();
  f.trackUser(user!.id);
  expect(user!.technician?.approvalStatus).toBe('APPROVED');
  const technicianId = user!.technician!.id;

  // ── ② 로그아웃 → 로그인 (발급된 자격증명이 실제로 통하는지) ──────────────
  await page.goto('/tech');
  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page).toHaveURL(/\/tech\/login/);
  await loginAsTech(page, { loginId, password });

  // ── ③ 계약 미서명 상태에서는 포털이 배정을 못 받는다고 경고한다 ──────────
  await expect(page.getByText('근로확인서 작성 필요')).toBeVisible();
  await expect(page.getByText('서명을 완료해야 배정(일)을 받을 수 있습니다.')).toBeVisible();

  // ── ④ 근로확인서 서명 = 근로확인 완료 ─────────────────────────────────────
  await page.goto('/tech/contract');
  await expect(page.getByText('아래 내용을 확인하고 서명하면 근로확인이 바로 완료됩니다.')).toBeVisible();
  await expect(page.locator('#ct-loc')).not.toHaveValue('');
  await expect(page.locator('#ct-job')).not.toHaveValue('');
  await expect(page.locator('#ct-name')).toHaveValue(name);

  // 서명 패드는 긴 폼의 맨 아래에 있다. page.mouse 는 **뷰포트 좌표**를 쓰므로
  // 스크롤 없이 boundingBox 를 읽으면 화면 밖 좌표가 나와 획이 캔버스에 닿지 않는다
  // (실측: 이 스크롤 없이는 '서명됨' 이 뜨지 않는다).
  const canvas = page.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize();
  expect(box!.y, '서명 패드가 뷰포트 안에 들어와야 마우스 좌표가 유효하다').toBeLessThan(
    viewport!.height,
  );
  await page.mouse.move(box!.x + 25, box!.y + 30);
  await page.mouse.down();
  await page.mouse.move(box!.x + 90, box!.y + 70, { steps: 8 });
  await page.mouse.move(box!.x + 150, box!.y + 35, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText('서명됨')).toBeVisible();

  await page.getByRole('button', { name: '서명하고 완료' }).click();
  await expect(page.getByText('서명 완료 — 근로확인이 완료되었습니다.')).toBeVisible();
  expect(
    (
      await prisma.employmentContract.findUnique({
        where: { technicianId },
        select: { status: true },
      })
    )?.status,
  ).toBe('CONFIRMED');

  await page.goto('/tech');
  await expect(page.getByText('근로확인서 서명 완료')).toBeVisible();

  // ── ⑤ 배정 도착 → 수락 ───────────────────────────────────────────────────
  const req = await f.createRequestFixture({
    status: 'ASSIGNED',
    urgency: 'URGENT',
    description: 'E2E 여정: 분전반에서 소리가 납니다',
    address: '서울특별시 강남구 테헤란로 20',
  });
  const assignment = await prisma.assignment.create({
    data: {
      requestId: req.id,
      technicianId,
      status: 'REQUESTED',
      assignedBy: 'ADMIN',
    },
  });

  await page.goto('/tech');
  // 포털의 "응답 대기"에 실제로 뜬다 (5초 폴링이라 도착까지 기다린다).
  await expect(page.getByText('E2E 여정: 분전반에서 소리가 납니다').first()).toBeVisible({
    timeout: 20_000,
  });

  await page.goto(`/tech/jobs/${assignment.id}`);
  await expect(page.getByText('E2E 여정: 분전반에서 소리가 납니다')).toBeVisible();
  await expect(page.getByText(req.customerName)).toBeVisible();

  await page.getByRole('button', { name: '수락하기' }).click();
  await expect(page.getByRole('button', { name: '출동 시작' })).toBeVisible();
  expect(
    (await prisma.serviceRequest.findUnique({ where: { id: req.id }, select: { status: true } }))
      ?.status,
  ).toBe('ACCEPTED');

  // ── ⑥ 출동 (되돌릴 수 없는 액션은 2단계 확인) ────────────────────────────
  await page.getByRole('button', { name: '출동 시작' }).click();
  await expect(page.getByText('출동을 시작할까요?')).toBeVisible();
  await page.getByRole('button', { name: '출동 시작' }).click();
  await expect(page.getByText('출동을 시작했습니다')).toBeVisible();
  expect(
    (await prisma.serviceRequest.findUnique({ where: { id: req.id }, select: { status: true } }))
      ?.status,
  ).toBe('DISPATCHED');

  // ── ⑦ 완료 → 만족도 조사가 뒤늦게 따라온다 ───────────────────────────────
  await page.getByRole('button', { name: '완료 처리' }).click();
  await expect(page.getByText('완료 처리할까요? 되돌릴 수 없습니다.')).toBeVisible();
  await page.getByRole('button', { name: '완료 확정' }).click();
  await expect(page.getByText('완료 처리했습니다')).toBeVisible();

  const done = await prisma.serviceRequest.findUnique({
    where: { id: req.id },
    select: { status: true, completedAt: true },
  });
  expect(done?.status).toBe('COMPLETED');
  expect(done?.completedAt).not.toBeNull();

  // 응답 이후 쓰기 2건 — 설문 행과 그 설문의 SMS 는 각각 따로 기다린다.
  await expect
    .poll(async () => prisma.satisfactionSurvey.count({ where: { requestId: req.id } }), {
      timeout: 15_000,
      message: '완료 후 SatisfactionSurvey 행이 생성되지 않았다',
    })
    .toBe(1);
  await expect
    .poll(
      async () =>
        prisma.smsLog.count({
          where: { requestId: req.id, body: { contains: '만족도 조사 참여' } },
        }),
      { timeout: 15_000, message: '완료 후 설문 안내 SmsLog 가 기록되지 않았다' },
    )
    .toBeGreaterThanOrEqual(1);

  const log = await prisma.smsLog.findFirst({
    where: { requestId: req.id, body: { contains: '만족도 조사 참여' } },
    orderBy: { createdAt: 'desc' },
  });
  expect(log?.provider).toBe('console'); // 과금 방어
});
