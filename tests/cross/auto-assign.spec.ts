import { expect, test, type APIRequestContext } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { apiContextOptions } from '../helpers/auth';
import { ipHeaders } from '../helpers/ip';
import { FixtureFactory } from '../helpers/fixtures';

// ───────────────────────────────────────────────────────────────────────────
// /api/internal/auto-assign (계획 Step 3d)
//
// 이 라우트는 GET·POST 를 **둘 다** export 하고 둘 다 같은 handle() 로 간다
// (route.ts:22-28). authorized() 는 x-cron-secret 과 Authorization: Bearer 를
// **둘 다** 받아준다(:10-11) — 주석이 "cron/curl 은 POST, Vercel Cron 은 GET"
// 이라고 적어 둔 건 용례 설명이지 메서드별 제약이 아니다. 여기서는 실제 동작을
// 그대로 단언한다 (4조합 전부 허용).
//
// ⚠️ 게이트 테스트는 AppSettings 를 **뒤집지 않는다.**
//    pretest-guard 가 실행 전체에 걸쳐 autoAssignEnabled=false 를 걸어 뒀고,
//    여기서 잠깐이라도 true 로 만들면 dev 서버의 30초 워커가 다른 스펙의
//    RECEIVED 픽스처를 물어 Assignment 를 만든다. 그 순간부터 기술자·업체
//    삭제가 assignment_one_assignee CHECK(23514) 로 영구 차단된다.
//    대신 **배정 조건을 전부 만족하는 미끼**를 만들어 두고 0건을 단언한다 —
//    게이트가 없다면 반드시 배정될 요청이므로 단언이 공허하지 않다.
// ───────────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();
const ENDPOINT = '/api/internal/auto-assign';

test.afterAll(async () => prisma.$disconnect());

let anon: APIRequestContext;

test.beforeAll(async ({ playwright }) => {
  anon = await playwright.request.newContext({
    baseURL: 'http://localhost:3000',
    extraHTTPHeaders: ipHeaders('auto-assign'),
  });
});
test.afterAll(async () => anon.dispose());

function cronSecret(): string {
  const secret = process.env.CRON_SECRET;
  expect(secret, 'CRON_SECRET 이 테스트 프로세스에 없다 — .env 로드를 확인하라').toBeTruthy();
  return secret!;
}

test('비밀키 없이는 GET·POST 모두 401', async () => {
  expect((await anon.get(ENDPOINT)).status()).toBe(401);
  expect((await anon.post(ENDPOINT)).status()).toBe(401);
});

test('틀린 비밀키는 GET·POST 모두 401', async () => {
  const wrong = `${cronSecret()}-wrong`;
  expect((await anon.get(ENDPOINT, { headers: { authorization: `Bearer ${wrong}` } })).status()).toBe(
    401,
  );
  expect((await anon.get(ENDPOINT, { headers: { 'x-cron-secret': wrong } })).status()).toBe(401);
  expect(
    (await anon.post(ENDPOINT, { headers: { 'x-cron-secret': wrong } })).status(),
  ).toBe(401);
  expect(
    (await anon.post(ENDPOINT, { headers: { authorization: `Bearer ${wrong}` } })).status(),
  ).toBe(401);
});

test('Bearer 접두 없이 비밀키만 넣으면 401 (authorization 은 정확 일치)', async () => {
  // route.ts:11 은 `Bearer ${secret}` 과의 **문자열 동등** 비교다.
  expect((await anon.get(ENDPOINT, { headers: { authorization: cronSecret() } })).status()).toBe(
    401,
  );
});

test('올바른 비밀키는 GET·POST × 두 헤더 4조합 모두 200', async () => {
  const secret = cronSecret();
  const combos: Array<[string, Record<string, string>]> = [
    ['GET + Authorization: Bearer', { authorization: `Bearer ${secret}` }],
    ['GET + x-cron-secret', { 'x-cron-secret': secret }],
  ];
  for (const [label, headers] of combos) {
    const res = await anon.get(ENDPOINT, { headers });
    expect(res.status(), label).toBe(200);
    // 워커가 꺼져 있으므로(autoAssign.ts:9-10) 항상 0건이다.
    expect(await res.json(), label).toEqual({ assigned: 0 });
  }
  for (const [label, headers] of [
    ['POST + x-cron-secret', { 'x-cron-secret': secret }],
    ['POST + Authorization: Bearer', { authorization: `Bearer ${secret}` }],
  ] as Array<[string, Record<string, string>]>) {
    const res = await anon.post(ENDPOINT, { headers });
    expect(res.status(), label).toBe(200);
    expect(await res.json(), label).toEqual({ assigned: 0 });
  }
});

test('autoAssignEnabled=false 는 배정 가능한 접수도 배정하지 않는다', async ({ playwright }) => {
  // 이 스펙의 유일한 전제. 뒤집지 않고 읽기만 한다.
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  expect(
    settings?.autoAssignEnabled,
    'pretest-guard 가 autoAssignEnabled=false 를 걸어야 한다',
  ).toBe(false);

  const f = new FixtureFactory(prisma);
  try {
    // 미끼: runAutoAssign 의 전 조건을 만족시킨다.
    //  · status RECEIVED (autoAssign.ts:19-22 의 스캔 대상)
    //  · assignBaseAt 이 대기시간을 한참 넘김 (:26-27) — 설정이 최대 1440분이라 25시간 전
    //  · regionFromAddress 가 판별 가능한 주소 (:32-33). 정식 명칭을 쓰는 이유는
    //    표기와 무관하게 판별되는 형태를 고정해 미끼의 전제를 흔들지 않기 위해서다
    //    (regions.ts 가 축약형도 정규화하므로 '서울 강남구' 도 이제 판별된다).
    const bait = await f.createRequestFixture({
      status: 'RECEIVED',
      urgency: 'NORMAL',
      address: '서울특별시 강남구 테헤란로 1',
      assignBaseAt: new Date(Date.now() - 25 * 60 * 60_000),
    });
    // regions: [] = 전 지역 담당(coversRegion:137), 계약 CONFIRMED 라야 후보에
    // 들어온다(matching.ts:50-55).
    await f.createTechFixture({ contractStatus: 'CONFIRMED', regions: [] });

    // 미끼가 실제로 배정 가능한지 제품 코드로 확인한다 — 이 확인이 없으면
    // "0건" 이 게이트 덕분인지 후보가 없어서인지 구분되지 않는다.
    const admin = await playwright.request.newContext(
      await apiContextOptions('ADMIN', {}, ipHeaders('auto-assign-admin')),
    );
    const candidatesRes = await admin.get(`/api/admin/requests/${bait.id}/candidates`);
    expect(candidatesRes.status()).toBe(200);
    const { candidates } = (await candidatesRes.json()) as {
      candidates: Array<{ coversRegion: boolean; rejectedThisRequest: boolean }>;
    };
    expect(
      candidates.filter((c) => c.coversRegion && !c.rejectedThisRequest).length,
      '미끼 접수를 담당할 후보가 있어야 게이트 단언이 의미를 가진다',
    ).toBeGreaterThan(0);
    await admin.dispose();

    const res = await anon.post(ENDPOINT, { headers: { 'x-cron-secret': cronSecret() } });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ assigned: 0 });

    // 응답만 믿지 않는다 — 게이트가 뚫렸다면 Assignment 행이 생겼을 것이다.
    expect(await prisma.assignment.count({ where: { requestId: bait.id } })).toBe(0);
    // 게이트는 :10 에서 즉시 반환하므로 "관리자 반환"(:35-38) 경로조차 타지 않는다.
    const after = await prisma.serviceRequest.findUnique({ where: { id: bait.id } });
    expect(after?.status).toBe('RECEIVED');
    expect(after?.needsAttention).toBe(false);

    // 다른 스펙·teardown 게이트가 RECEIVED 잔재를 보지 않도록 즉시 무해화한다.
    await prisma.serviceRequest.update({
      where: { id: bait.id },
      data: { status: 'CANCELED' },
    });
  } finally {
    await f.cleanupAll();
  }
});
