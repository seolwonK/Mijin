import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { ipHeaders } from '../helpers/ip';
import { FixtureFactory, ephemeralPhone } from '../helpers/fixtures';

// ───────────────────────────────────────────────────────────────────────────
// 고객 UI 종단 여정 (계획 Step 4c) — 계약이 아니라 **사용자 가치**를 단언한다.
//   /request/new → /request/complete/[id] → /lookup → /survey/[token]
//
// 여정은 1회만 돈다. 상태코드·검증 분기는 intake-api / lookup-survey-api 가 덮는다.
//
// UI 층도 계약 층과 같은 이유로 고유 IP 가 필요하다: /lookup 페이지는 진행 중인 건이
// 있으면 15초마다 /api/requests/lookup 을 폴링하고(page.tsx:161-166) 그 라우트는
// IP당 분당 10회 제한이다. 실행마다 바뀌는 nonce IP 로 버킷을 분리한다.
// ───────────────────────────────────────────────────────────────────────────

test.use({ extraHTTPHeaders: ipHeaders('customer-journey') });

const prisma = new PrismaClient();
const f = new FixtureFactory(prisma);

/**
 * 이 스펙이 만드는 접수를 식별하는 **유일한 값**. 다른 어떤 스펙·워커도 쓰지 않는다.
 *
 * 접수 id 는 제품이 발급하므로(9001 대역 밖) 미리 알 수 없다. 그래서 id 추적만으로는
 * "생성됐지만 아직 등록되지 않은" 창이 남고, 그 사이에서 죽으면 정리가 영영 못 찾는다.
 * 실제로 전체 스위트 실행에서 그 창에 걸려 RECEIVED 행이 새어 나갔고, teardown 이
 * (설계대로) autoAssignEnabled 복원을 보류해 **다음 실행 전체가 거부**될 뻔했다.
 *
 * 따라서 정리는 id 가 아니라 **이 이름**으로 회수한다 — 테스트가 몇 번째 줄에서 죽든,
 * 심지어 지난 실행이 남긴 잔재까지 잡힌다.
 */
const JOURNEY_CUSTOMER = 'E2E 여정고객';

/**
 * next dev 는 라우트를 **요청받은 시점에** 컴파일한다. App Router 의 클라이언트 내비게이션은
 * RSC 페이로드를 받은 뒤에야 URL 을 커밋하므로, 콜드 라우트로의 첫 이동은 컴파일이 끝날
 * 때까지 이전 URL 에 머문다. 단독 실행에서는 순식간이지만 전체 스위트 병렬 실행에서는
 * 기본 5초를 넘긴다(실측: `/request/complete/[id]` 에서 13회 폴링 내내 `/request/new`).
 * 재시도로 덮지 않고 **전제를 명시**한다 — 느린 것은 정상이고, 안 가는 것이 실패다.
 */
const COLD_NAV = 60_000;

test.afterAll(async () => {
  // id 추적과 무관하게, 이 스펙의 흔적을 이름으로 전수 회수한다.
  const orphans = await prisma.serviceRequest.findMany({
    where: { customerName: JOURNEY_CUSTOMER },
    select: { id: true },
  });
  for (const o of orphans) f.trackRequest(o.id);
  // cleanupAll 이 FK 역순으로(설문 → 배정 → 접수 → 음성 StoredFile) 되돌린다.
  await f.cleanupAll();
  await prisma.$disconnect();
});

test('고객 여정: 접수 → 접수완료 → 진행조회 → 만족도 조사 제출', async ({ page }) => {
  // 콜드 컴파일 3회(complete·lookup·survey)를 허용해야 하므로 기본 30초로는 부족하다.
  test.setTimeout(180_000);

  const customerName = JOURNEY_CUSTOMER;
  const customerPhone = ephemeralPhone();
  const address = '서울특별시 강남구 테헤란로 152';

  // ── 1. 접수 ────────────────────────────────────────────────────────────
  await page.goto('/request/new');

  await page.locator('#req-desc textarea').fill('E2E 여정: 두꺼비집이 계속 내려갑니다');
  await page.getByRole('radio', { name: '일반' }).click();
  // 지오코딩·GPS 권한에 의존하지 않도록 주소를 직접 입력한다 (LocationPicker 하단 입력란).
  await page.locator('#req-loc input[type="text"]').fill(address);
  await page.locator('#req-name').fill(customerName);
  await page.locator('#req-phone').fill(customerPhone);
  await page.locator('#req-agree').check();
  await page.getByRole('button', { name: '접수하기' }).click();

  // ── 2. 접수 완료 ───────────────────────────────────────────────────────
  // 여기서 붉어져도 afterAll 의 이름 기반 회수가 접수 행을 잡는다(위 JOURNEY_CUSTOMER 주석).
  await expect(page).toHaveURL(/\/request\/complete\/[^/]+$/, { timeout: COLD_NAV });
  const requestId = new URL(page.url()).pathname.split('/').pop()!;
  // 2차 방어. 1차는 afterAll 의 이름 기반 회수이며, 이 줄을 통째로 지우고 실행해
  // 그것만으로 회수됨을 실측 확인했다 (잔재 0 · autoAssignEnabled=t · state 파일 없음).
  f.trackRequest(requestId);

  const created = await prisma.serviceRequest.findUniqueOrThrow({ where: { id: requestId } });
  expect(created.customerName).toBe(customerName);
  expect(created.customerPhone).toBe(customerPhone);
  expect(created.address).toBe(address);
  expect(created.status).toBe('RECEIVED');

  await expect(page.getByRole('heading', { name: '접수가 완료되었습니다' })).toBeVisible();
  await expect(page.getByText(created.lookupCode, { exact: true })).toBeVisible();

  // ── 3. 진행 상황 조회 ──────────────────────────────────────────────────
  await page.getByRole('link', { name: '진행 상황 조회하기' }).click();
  await expect(page).toHaveURL(new RegExp(`/lookup\\?phone=${customerPhone}`), {
    timeout: COLD_NAV,
  });
  // 도착 후에도 클라이언트가 /api/requests/lookup 을 한 번 더 타야 카드가 그려진다.
  await expect(page.getByText(`접수번호 ${created.lookupCode}`)).toBeVisible({
    timeout: COLD_NAV,
  });
  // 아직 미완료 — 설문 링크는 뜨지 않는다 (page.tsx:83).
  await expect(page.getByRole('link', { name: '만족도 조사 참여' })).toHaveCount(0);

  // ── 4. 완료 처리 + 설문 발급 ───────────────────────────────────────────
  // 완료 전이(전기기사/업체 status 라우트)는 Step 5·6 이 계약으로 덮는다. 여기서는
  // 고객이 보는 화면만이 관심사이므로 완료 상태를 DB 에 직접 만든다.
  const tech = await f.createTechFixture();
  await prisma.serviceRequest.update({
    where: { id: requestId },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
  const token = `e2e${randomBytes(12).toString('hex')}`;
  await prisma.satisfactionSurvey.create({
    data: { requestId, token, technicianId: tech.technicianId },
  });

  await page.reload();
  const surveyLink = page.getByRole('link', { name: '만족도 조사 참여' });
  await expect(surveyLink).toBeVisible({ timeout: COLD_NAV });
  await surveyLink.click();

  // ── 5. 만족도 조사 제출 ────────────────────────────────────────────────
  await expect(page).toHaveURL(new RegExp(`/survey/${token}$`), { timeout: COLD_NAV });
  await page.getByRole('button', { name: '5점' }).click();
  await page.locator('#survey-amount input').fill('120000');
  await page.getByRole('button', { name: '제출하기' }).click();

  await expect(page.getByRole('heading', { name: '참여 완료' })).toBeVisible({
    timeout: COLD_NAV,
  });

  const survey = await prisma.satisfactionSurvey.findUniqueOrThrow({ where: { token } });
  expect(survey.rating).toBe(5);
  expect(survey.paidAmount).toBe(120_000);
  expect(survey.submittedAt).not.toBeNull();

  // 제출 후 조회 화면은 링크 대신 '참여 완료' 배지를 보인다 (page.tsx:84-87).
  await page.goto(`/lookup?phone=${customerPhone}`);
  await expect(page.getByText('참여 완료')).toBeVisible({ timeout: COLD_NAV });
  await expect(page.getByRole('link', { name: '만족도 조사 참여' })).toHaveCount(0);
});
