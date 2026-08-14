import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { FixtureFactory } from '../helpers/fixtures';
import { loginAsPartner } from '../helpers/auth';
import { ipHeaders } from '../helpers/ip';
import { adminCtx, signupFields, trackSignedUpPartner, CERT_UPLOAD } from './helpers';

// ───────────────────────────────────────────────────────────────────────────
// 업체 UI 종단 — 계획 Step 6e
//   가입 → 승인대기 화면 → (로그인 차단 확인) → 관리자 승인 → 로그인 → 수락 → 완료
//
// 계약(상태코드·부수효과)은 나머지 4개 스펙이 API 층에서 단언한다. 여기서 보는 것은
// **사용자가 실제로 그 경로를 걸을 수 있는가** 뿐이다: 가입 폼이 제출되는가, 승인
// 대기 화면이 뜨는가, 승인 전 로그인이 화면에서 막히는가, 배정된 건이 포털에 뜨고
// 버튼으로 완료까지 가는가.
//
// 가입 폼은 /api/partner/signup 을 태우므로 IP당 10분/5회 제한을 공유한다.
// 다른 워커의 UI 트래픽과 버킷이 겹치지 않도록 이 파일 전용 IP 를 쓴다.
// ───────────────────────────────────────────────────────────────────────────

test.use({ extraHTTPHeaders: ipHeaders('partner-journey') });

const prisma = new PrismaClient();
test.afterAll(async () => prisma.$disconnect());

let f: FixtureFactory;
test.beforeEach(() => {
  f = new FixtureFactory(prisma);
});
test.afterEach(async () => {
  await f.cleanupAll();
});

test('가입 → 승인대기 → 관리자 승인 → 로그인 → 수락 → 출동 → 완료', async ({
  page,
  playwright,
}) => {
  // 폼 입력·가입·승인·로그인·3단 상태전이가 한 테스트에 들어간다. dev 서버 첫 컴파일까지
  // 포함되므로 기본 30초로는 부족하다.
  test.setTimeout(180_000);
  const fields = signupFields();

  // ── 1. 가입 신청 ─────────────────────────────────────────────────────────
  await page.goto('/partner/signup');
  await page.getByLabel('로그인 아이디').fill(fields.loginId);
  // 아이디 중복 확인이 통과돼야 제출이 허용된다
  await page.getByRole('button', { name: '중복 확인' }).click();
  await expect(page.getByText('사용할 수 있는 아이디입니다')).toBeVisible();
  await page.getByLabel('비밀번호', { exact: true }).fill(fields.password);
  await page.getByLabel('비밀번호 확인', { exact: true }).fill(fields.password);
  await page.getByLabel('업체명').fill(fields.name);
  // exact 없이는 ReferrerField 의 '추천인 전화번호' 까지 걸린다.
  await page.getByLabel('전화번호', { exact: true }).fill(fields.phone);

  // RegionSelect 는 라벨이 없는 select 2개다. 페이지에 RegionMultiSelect 의 select 도
  // 있으므로 "업체 정보" 섹션으로 스코프를 좁힌다.
  const infoSection = page.locator('section', {
    has: page.getByRole('heading', { name: '업체 정보' }),
  });
  await infoSection.locator('select').nth(0).selectOption('서울특별시');
  await infoSection.locator('select').nth(1).selectOption('강남구');
  await page.getByLabel('상세 주소').fill('테헤란로 152');

  await page.getByLabel('사업자등록번호').fill(fields.bizRegNo);
  await page.getByLabel('사업자등록증 첨부').setInputFiles({ ...CERT_UPLOAD });
  await page
    .getByLabel('전기공사업 등록증 첨부')
    .setInputFiles({ ...CERT_UPLOAD, name: 'elec-cert.png' });
  await page.getByRole('checkbox').check();

  await page.getByRole('button', { name: '가입 신청하기' }).click();

  // ── 2. 승인대기 화면 ─────────────────────────────────────────────────────
  await expect(page.getByRole('heading', { name: '가입 신청이 접수되었습니다' })).toBeVisible();
  await expect(
    page.getByText('관리자가 사업자등록증·전기공사업 등록증을 확인한 뒤 승인합니다.'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: '로그인 화면으로' })).toBeVisible();

  const { providerId } = await trackSignedUpPartner(prisma, f, fields.loginId);
  expect(
    (await prisma.provider.findUnique({ where: { id: providerId } }))?.approvalStatus,
  ).toBe('PENDING');

  // ── 3. 승인 전에는 화면에서도 로그인이 막힌다 ───────────────────────────
  await page.goto('/partner/login');
  await page.locator('#loginId').fill(fields.loginId);
  await page.locator('#password').fill(fields.password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  // getByRole('alert') 는 Next 의 __next-route-announcer__ 까지 잡는다 — 폼 오류 <p> 로 좁힌다.
  await expect(page.locator('p[role="alert"]')).toContainText('승인 대기');
  await expect(page, '승인 전에는 포털로 넘어가지 않는다').toHaveURL(/\/partner\/login/);

  // ── 4. 관리자 승인 ───────────────────────────────────────────────────────
  const admin = await adminCtx(playwright, 'journey-admin');
  expect((await admin.post(`/api/admin/providers/${providerId}/approve`)).status()).toBe(200);
  await admin.dispose();

  // ── 5. 로그인 ────────────────────────────────────────────────────────────
  // 한때 여기엔 인라인 로그인이 있었다. helpers/auth.ts 의 loginAsPartner 가
  // `toHaveURL(/\/partner(\/|$)/)` 로 단언해 **출발지인 /partner/login 에도 매치**됐고,
  // 로그인이 실패해도 통과한 뒤 goto('/partner') 가 세션 없이 되튕겼기 때문이다(실제 재현).
  // worker-infra 가 pathname 완전일치 술어(arrivedAt)로 고쳤고, 그 술어는 내가 쓰던
  // `/\/partner$/` 보다 강하다 — 정규식은 toHaveURL 에서 비앵커 검색이라
  // 쿼리에 목적지가 실린 URL 까지 매치될 여지가 있다. 우회를 걷어내고 정본으로 돌아간다.
  await loginAsPartner(page, { loginId: fields.loginId, password: fields.password });

  // ── 6. 배정이 포털에 뜬다 ────────────────────────────────────────────────
  const req = await f.createRequestFixture({
    status: 'ASSIGNED',
    description: 'E2E 여정 — 분전반 차단기 트립',
    address: '서울특별시 강남구 테헤란로 152',
  });
  const assignment = await prisma.assignment.create({
    data: { requestId: req.id, providerId, status: 'REQUESTED', assignedBy: 'ADMIN' },
  });

  await page.goto('/partner');
  await expect(page.getByRole('heading', { name: /^응답 대기/ })).toBeVisible();
  const card = page.locator(`a[href="/partner/jobs/${assignment.id}"]`);
  await expect(card).toBeVisible();
  await expect(card).toContainText('E2E 여정 — 분전반 차단기 트립');
  await card.click();

  // ── 7. 수락 → 출동 → 완료 ───────────────────────────────────────────────
  await expect(page).toHaveURL(new RegExp(`/partner/jobs/${assignment.id}$`));
  await expect(page.getByText(req.customerPhone)).toBeVisible();

  await page.getByRole('button', { name: '수락하기' }).click();
  // 출동 버튼이 뜬다는 것 자체가 배정 ACCEPTED + 접수 ACCEPTED 를 의미한다
  // (page.tsx:102 의 canDispatch 조건).
  const dispatch = page.getByRole('button', { name: '출동 시작' });
  await expect(dispatch).toBeVisible();

  // 되돌릴 수 없는 액션은 2단계 확인 — 트리거 클릭 후 같은 이름의 확정 버튼이 뜬다.
  await dispatch.click();
  await expect(page.getByText('출동을 시작할까요?')).toBeVisible();
  await page.getByRole('button', { name: '출동 시작' }).click();
  await expect(page.getByText('출동을 시작했습니다')).toBeVisible();

  await page.getByRole('button', { name: '완료 처리' }).click();
  await expect(page.getByText('완료 처리할까요? 되돌릴 수 없습니다.')).toBeVisible();
  await page.getByRole('button', { name: '완료 확정' }).click();
  await expect(page.getByText('완료 처리했습니다')).toBeVisible();

  // ── 8. 최종 상태 ─────────────────────────────────────────────────────────
  expect((await prisma.serviceRequest.findUnique({ where: { id: req.id } }))?.status).toBe(
    'COMPLETED',
  );
  expect((await prisma.assignment.findUnique({ where: { id: assignment.id } }))?.status).toBe(
    'ACCEPTED',
  );
  // 완료 훅은 fire-and-forget(status/route.ts:64) 이라 화면 전환보다 늦게 도착할 수 있다.
  await expect
    .poll(async () => prisma.satisfactionSurvey.count({ where: { requestId: req.id } }), {
      timeout: 20_000,
      intervals: [200, 400, 800, 1_000],
      message: '완료 시 만족도 조사 행이 뒤따른다',
    })
    .toBe(1);
});
