import { randomBytes } from 'node:crypto';
import { expect, request as apiRequest, test, type APIRequestContext } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { apiContextOptions } from '../helpers/auth';
import { ipHeaders } from '../helpers/ip';
import { FixtureFactory, ephemeralPhone, type TechFixture } from '../helpers/fixtures';

// ───────────────────────────────────────────────────────────────────────────
// 고객 조회·설문 + 공개 보조 라우트 계약.
//
//   POST /api/requests/lookup   (route.ts)      — 정상·오류·429
//   GET  /api/survey/[token]    (:37-55)        — 404 / 200
//   POST /api/survey/[token]    (:57-111)       — 경계·409·수수료 적립·429
//   GET  /api/geo/reverse                       — 400 / 200
//   POST /api/identity/verify                   — 400 / 200 / 429
//   POST /api/referrer/lookup                   — 400 / 200(마스킹·승인 필터)
//
// ⚠️ 레이트리밋 버킷 격리: 위 라우트 중 lookup·survey·identity·referrer 4개가
// 인메모리 IP 카운터를 쓴다(장수 dev 서버의 모듈 상태). 테스트마다 seed 를 달리해
// 버킷을 분리하지 않으면 앞 테스트가 태운 카운터가 뒤 테스트를 429 로 만든다.
// 429 단언 테스트는 **전용 seed** 를 쓰고 그 버킷을 끝까지 태운다.
//
// ⚠️ 429 를 유도할 때는 일부러 400 이 나는 본문을 보낸다 — 4개 라우트 모두
// 레이트리밋을 파싱보다 **먼저** 검사하므로(예: survey/[token]:61-67) 카운터는
// 똑같이 올라가면서 DB 행은 하나도 만들지 않는다.
// ───────────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();
const f = new FixtureFactory(prisma);

/** seed 로 버킷이 갈리는 익명 컨텍스트. */
async function anonCtx(seed: string): Promise<APIRequestContext> {
  return apiRequest.newContext(await apiContextOptions(null, {}, ipHeaders(seed)));
}

/**
 * 정식 시/도 표기 주소. 축약형('서울 강남구')도 이제 해석된다 —
 * regionFromAddress 가 내부에서 SIDO_ALIASES 로 정규화하도록 고쳐졌기 때문이다.
 * 그럼에도 정식 표기를 쓰는 이유는 카카오 역지오코딩이 내는 실제 형태이기 때문이다.
 */
const FORMAL_ADDRESS = '서울특별시 강남구 테헤란로 152';

/** 설문 1건 + 그 설문이 매달릴 완료 접수 1건. CHECK 제약상 대상은 정확히 하나여야 한다. */
async function createSurveyFixture(technicianId: string) {
  const req = await f.createRequestFixture({ status: 'COMPLETED', address: FORMAL_ADDRESS });
  await prisma.serviceRequest.update({ where: { id: req.id }, data: { completedAt: new Date() } });
  const survey = await prisma.satisfactionSurvey.create({
    data: {
      requestId: req.id,
      token: `e2e${randomBytes(12).toString('hex')}`,
      technicianId, // satisfaction_survey_one_assignee CHECK — providerId 와 XOR
    },
  });
  return { req, survey };
}

let subjectTech: TechFixture;

test.beforeAll(async () => {
  subjectTech = await f.createTechFixture();
});

/** identity/verify 가 만드는 행의 식별자 — id 는 응답을 받아야 알 수 있어 추적 창이 생긴다. */
const IDENTITY_NAME = 'E2E 본인인증';

test.afterAll(async () => {
  // 접수 행은 전부 f.createRequestFixture 가 **생성 즉시** 등록하므로 창이 없다.
  // 반면 identity/verify 행은 제품이 id 를 발급하므로 이름으로 전수 회수한다.
  const orphans = await prisma.identityVerification.findMany({
    where: { name: IDENTITY_NAME },
    select: { id: true },
  });
  for (const o of orphans) f.trackVerification(o.id);
  await f.cleanupAll();
  await prisma.$disconnect();
});

// ───────────────────────────────────────────────────────────────────────────
// POST /api/requests/lookup
// ───────────────────────────────────────────────────────────────────────────

test('lookup: 접수한 번호로 본인 건이 조회된다', async () => {
  const ctx = await anonCtx('cust-lookup-hit');
  const req = await f.createRequestFixture({
    description: 'E2E 조회 대상',
    address: FORMAL_ADDRESS,
  });

  const res = await ctx.post('/api/requests/lookup', { data: { phone: req.customerPhone } });
  expect(res.status()).toBe(200);
  const body = await res.json();

  const mine = (body.requests as Array<Record<string, unknown>>).find((r) => r.id === req.id);
  expect(mine, '방금 만든 접수가 조회 결과에 없습니다').toBeTruthy();
  expect(mine!.lookupCode).toBe(req.lookupCode);
  expect(mine!.customerName).toBe(req.customerName);
  expect(mine!.assignee).toBeNull();
  expect(mine!.survey).toBeNull(); // COMPLETED 아님 → route.ts:72-80
  await ctx.dispose();
});

test('lookup: 미등록 번호는 빈 배열', async () => {
  const ctx = await anonCtx('cust-lookup-miss');
  // 9001 대역 픽스처 번호와 겹치지 않는 자리(0109009…)를 쓴다.
  const res = await ctx.post('/api/requests/lookup', { data: { phone: '0109009' + '000' } });
  expect(res.status()).toBe(200);
  expect((await res.json()).requests).toEqual([]);
  await ctx.dispose();
});

test('lookup: 400 — 전화번호 형식 / 잘못된 JSON', async () => {
  const ctx = await anonCtx('cust-lookup-400');
  const bad = await ctx.post('/api/requests/lookup', { data: { phone: '12345' } });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error).toBe('전화번호 형식이 올바르지 않습니다');

  // ⚠️ Buffer 로 보내야 원문이 그대로 간다. 문자열을 주면 Playwright 가 다시 JSON
  // 직렬화해 `"{\"phone\":"` (유효한 JSON 문자열)이 되고 파싱 분기가 아니라 zod 분기가 탄다.
  const broken = await ctx.post('/api/requests/lookup', {
    headers: { 'content-type': 'application/json' },
    data: Buffer.from('{"phone":'),
  });
  expect(broken.status()).toBe(400);
  expect((await broken.json()).error).toBe('잘못된 요청입니다');
  await ctx.dispose();
});

test('lookup: 429 — 같은 IP 분당 10회 초과 (route.ts:9-21)', async () => {
  const ctx = await anonCtx('cust-lookup-429');
  // 400 이 나는 본문으로 태운다 — 레이트리밋은 파싱 전에 검사되므로 카운터는 같이 오른다.
  const body = { phone: '12345' };
  for (let i = 1; i <= 10; i++) {
    const res = await ctx.post('/api/requests/lookup', { data: body });
    expect(res.status(), `${i}번째 요청은 아직 통과해야 한다`).toBe(400);
  }
  const limited = await ctx.post('/api/requests/lookup', { data: body });
  expect(limited.status()).toBe(429);
  expect((await limited.json()).error).toBe('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
  await ctx.dispose();
});

test('lookup: COMPLETED 건은 미제출 설문 링크를 싣고, 제출 후에는 토큰을 감춘다', async () => {
  const ctx = await anonCtx('cust-lookup-survey');
  const { req, survey } = await createSurveyFixture(subjectTech.technicianId);

  const before = await ctx.post('/api/requests/lookup', { data: { phone: req.customerPhone } });
  expect(before.status()).toBe(200);
  const mineBefore = ((await before.json()).requests as Array<Record<string, unknown>>).find(
    (r) => r.id === req.id,
  );
  expect(mineBefore!.survey).toEqual({ submitted: false, url: `/survey/${survey.token}` });

  const submit = await ctx.post(`/api/survey/${survey.token}`, { data: { rating: 4 } });
  expect(submit.status()).toBe(200);

  const after = await ctx.post('/api/requests/lookup', { data: { phone: req.customerPhone } });
  const mineAfter = ((await after.json()).requests as Array<Record<string, unknown>>).find(
    (r) => r.id === req.id,
  );
  // 제출 완료 건은 재제출 유도를 막기 위해 url 을 싣지 않는다 (route.ts:74-79).
  expect(mineAfter!.survey).toEqual({ submitted: true });
  await ctx.dispose();
});

// ───────────────────────────────────────────────────────────────────────────
// GET /api/survey/[token]
// ───────────────────────────────────────────────────────────────────────────

test('survey GET: 404 — 없는 토큰 (:47-49)', async () => {
  const ctx = await anonCtx('cust-survey-get');
  const res = await ctx.get(`/api/survey/e2e-nonexistent-${randomBytes(8).toString('hex')}`);
  expect(res.status()).toBe(404);
  expect((await res.json()).error).toBe('설문을 찾을 수 없습니다');
  await ctx.dispose();
});

test('survey GET: 200 — 미제출 상태와 완료 시각을 돌려준다 (:51-54)', async () => {
  const ctx = await anonCtx('cust-survey-get');
  const { survey } = await createSurveyFixture(subjectTech.technicianId);
  const res = await ctx.get(`/api/survey/${survey.token}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.submitted).toBe(false);
  expect(typeof body.completedAt).toBe('string');
  await ctx.dispose();
});

// ───────────────────────────────────────────────────────────────────────────
// POST /api/survey/[token]
// ───────────────────────────────────────────────────────────────────────────

test('survey POST: 400 — rating 경계·타입 (:24)', async () => {
  const ctx = await anonCtx('cust-survey-rating');
  const { survey } = await createSurveyFixture(subjectTech.technicianId);

  // 0=min 위반, 3.5=int 위반 — 제품이 두 검사에 **같은 문구**를 쓰므로(:24) 메시지만으로는
  // 둘을 구분할 수 없다. 6(max)은 문구가 달라 구분된다. 여기서 확인 가능한 것은
  // "rating 검증이 실제로 탔다"까지이며, 그 이상을 주장하지 않는다.
  for (const [rating, message] of [
    [0, '별점을 선택해 주세요'],
    [6, '별점은 5점까지입니다'],
    [3.5, '별점을 선택해 주세요'],
  ] as Array<[number, string]>) {
    const res = await ctx.post(`/api/survey/${survey.token}`, { data: { rating } });
    expect(res.status(), `rating=${rating}`).toBe(400);
    expect((await res.json()).error, `rating=${rating}`).toBe(message);
  }

  // 400 이 CAS 를 태우지 않았는지 — 여전히 미제출이어야 한다.
  const row = await prisma.satisfactionSurvey.findUnique({ where: { id: survey.id } });
  expect(row?.submittedAt).toBeNull();
  await ctx.dispose();
});

test('survey POST: 400 — 후기 500자 초과 (:34) / 잘못된 JSON (:72-76)', async () => {
  const ctx = await anonCtx('cust-survey-comment');
  const { survey } = await createSurveyFixture(subjectTech.technicianId);

  const tooLong = await ctx.post(`/api/survey/${survey.token}`, {
    data: { rating: 5, comment: 'ㄱ'.repeat(501) },
  });
  expect(tooLong.status()).toBe(400);
  expect((await tooLong.json()).error).toBe('후기는 500자 이내로 입력해 주세요');

  const ok = await ctx.post(`/api/survey/${survey.token}`, {
    data: { rating: 5, comment: 'ㄱ'.repeat(500) },
  });
  expect(ok.status(), '정확히 500자는 허용돼야 한다').toBe(200);

  const broken = await ctx.post(`/api/survey/${survey.token}`, {
    headers: { 'content-type': 'application/json' },
    data: Buffer.from('{"rating":'),
  });
  expect(broken.status()).toBe(400);
  expect((await broken.json()).error).toBe('잘못된 요청입니다');
  await ctx.dispose();
});

test('survey POST: paidAmount 생략 가능(:27-33) → 제출 기록 + 재제출은 409(:95-101)', async () => {
  const ctx = await anonCtx('cust-survey-submit');
  const { survey } = await createSurveyFixture(subjectTech.technicianId);

  const first = await ctx.post(`/api/survey/${survey.token}`, { data: { rating: 5 } });
  expect(first.status()).toBe(200);
  expect(await first.json()).toEqual({ ok: true });

  const row = await prisma.satisfactionSurvey.findUnique({ where: { id: survey.id } });
  expect(row?.rating).toBe(5);
  expect(row?.paidAmount).toBeNull(); // 선택 입력 — 생략 시 null
  expect(row?.comment).toBeNull();
  expect(row?.submittedAt).not.toBeNull();
  // paidAmount 가 null 이면 수수료 적립을 건너뛴다 (commission.ts:16).
  expect(await prisma.commissionEntry.count({ where: { surveyId: survey.id } })).toBe(0);

  const again = await ctx.post(`/api/survey/${survey.token}`, { data: { rating: 1 } });
  expect(again.status()).toBe(409);
  expect((await again.json()).error).toBe('이미 제출된 설문입니다');

  // 409 는 기존 값을 덮어쓰지 않는다 (updateMany 의 submittedAt:null 조건).
  const after = await prisma.satisfactionSurvey.findUnique({ where: { id: survey.id } });
  expect(after?.rating).toBe(5);

  // paidAmount: null 명시도 동일하게 허용된다.
  const other = await createSurveyFixture(subjectTech.technicianId);
  const withNull = await ctx.post(`/api/survey/${other.survey.token}`, {
    data: { rating: 3, paidAmount: null },
  });
  expect(withNull.status()).toBe(200);
  expect(
    (await prisma.satisfactionSurvey.findUnique({ where: { id: other.survey.id } }))?.paidAmount,
  ).toBeNull();
  await ctx.dispose();
});

test('survey POST: 404 — 없는 토큰 (:100)', async () => {
  const ctx = await anonCtx('cust-survey-404');
  const res = await ctx.post(`/api/survey/e2e-missing-${randomBytes(8).toString('hex')}`, {
    data: { rating: 5 },
  });
  expect(res.status()).toBe(404);
  expect((await res.json()).error).toBe('설문을 찾을 수 없습니다');
  await ctx.dispose();
});

test('survey POST: 소개자가 있으면 수수료가 적립된다 (:105 → commission.ts)', async () => {
  const ctx = await anonCtx('cust-survey-commission');
  const referrer = await f.createTechFixture();
  const referred = await f.createTechFixture();
  await prisma.technician.update({
    where: { id: referred.technicianId },
    data: { referredByUserId: referrer.userId },
  });

  const { survey } = await createSurveyFixture(referred.technicianId);
  const res = await ctx.post(`/api/survey/${survey.token}`, {
    data: { rating: 5, paidAmount: 120_000, comment: 'E2E 후기' },
  });
  expect(res.status()).toBe(200);

  // accrueCommissionForSurvey 는 라우트가 await 한다(:105) — poll 불필요.
  const entry = await prisma.commissionEntry.findFirst({ where: { surveyId: survey.id } });
  expect(entry, '수수료 원장이 적립되지 않았습니다').not.toBeNull();
  expect(entry?.referrerUserId).toBe(referrer.userId);
  expect(entry?.technicianId).toBe(referred.technicianId);
  expect(entry?.baseAmount).toBe(120_000);
  expect(entry?.amount).toBe(2_400); // floor(120000 * 0.02)
  await ctx.dispose();
});

test('survey POST: 429 — 같은 IP 분당 10회 초과 (:6-21)', async () => {
  const ctx = await anonCtx('cust-survey-429');
  const token = `e2e-burn-${randomBytes(8).toString('hex')}`;
  for (let i = 1; i <= 10; i++) {
    const res = await ctx.post(`/api/survey/${token}`, { data: { rating: 0 } });
    expect(res.status(), `${i}번째 요청은 아직 통과해야 한다`).toBe(400);
  }
  const limited = await ctx.post(`/api/survey/${token}`, { data: { rating: 0 } });
  expect(limited.status()).toBe(429);
  expect((await limited.json()).error).toBe('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
  await ctx.dispose();
});

// ───────────────────────────────────────────────────────────────────────────
// GET /api/geo/reverse — 카카오 실호출(계획 확정 제약). 키 만료 시 address 는 null 이
// 될 수 있으므로 **값이 아니라 계약(키 존재·타입)** 만 단언한다(R8).
// ───────────────────────────────────────────────────────────────────────────

test('geo/reverse: 400 — 좌표 누락·비수치 (:9-11)', async () => {
  const ctx = await anonCtx('cust-geo');
  for (const qs of ['', '?lat=37.5', '?lng=127', '?lat=abc&lng=127']) {
    const res = await ctx.get(`/api/geo/reverse${qs}`);
    expect(res.status(), qs).toBe(400);
    expect((await res.json()).error, qs).toBe('좌표가 올바르지 않습니다');
  }
  await ctx.dispose();
});

test('geo/reverse: 200 — address 키를 string|null 로 돌려준다', async () => {
  const ctx = await anonCtx('cust-geo');
  const res = await ctx.get('/api/geo/reverse?lat=37.5006&lng=127.0364');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect('address' in body).toBe(true);
  expect(body.address === null || typeof body.address === 'string').toBe(true);
  await ctx.dispose();
});

// ───────────────────────────────────────────────────────────────────────────
// POST /api/identity/verify — IDENTITY_PROVIDER=mock (계획 확정 제약)
// ───────────────────────────────────────────────────────────────────────────

test('identity/verify: 200 — verificationId 발급 + IdentityVerification 행 생성', async () => {
  const ctx = await anonCtx('cust-identity-ok');
  const phone = ephemeralPhone();
  const res = await ctx.post('/api/identity/verify', {
    data: { name: IDENTITY_NAME, phone },
  });
  const body = await res.json();
  if (typeof body?.verificationId === 'string') f.trackVerification(body.verificationId);

  expect(res.status(), JSON.stringify(body)).toBe(200);
  expect(body.ok).toBe(true);
  expect(body.name).toBe(IDENTITY_NAME);
  expect(body.phone).toBe(phone);

  const row = await prisma.identityVerification.findUnique({
    where: { id: body.verificationId as string },
  });
  expect(row?.provider).toBe('mock');
  expect(row?.consumedAt).toBeNull();
  expect(row!.expiresAt.getTime()).toBeGreaterThan(Date.now()); // 10분 TTL
  await ctx.dispose();
});

test('identity/verify: 400 — zod 분기와 provider 분기를 메시지로 구분한다', async () => {
  const ctx = await anonCtx('cust-identity-400');

  // 이 라우트는 400 을 세 곳에서 낸다: 파싱(:42-44) · zod(:46-49) · provider throw(:54-57).
  // 코드가 전부 같으므로 메시지를 봐야 의도한 분기가 탔는지 알 수 있다.
  const PROVIDER_MISSING = '이름과 휴대폰번호를 입력해 주세요 (개발용 인증)'; // identity/mock.ts:11

  // zod 는 전부 optional 이라 {} 는 **통과**한다 — 400 은 provider 에서 나온다.
  const empty = await ctx.post('/api/identity/verify', { data: {} });
  expect(empty.status()).toBe(400);
  expect((await empty.json()).error).toBe(PROVIDER_MISSING);

  const noPhone = await ctx.post('/api/identity/verify', { data: { name: '홍길동' } });
  expect(noPhone.status()).toBe(400);
  expect((await noPhone.json()).error).toBe(PROVIDER_MISSING);

  // zod 분기(:46-49)는 별도 메시지를 낸다 — name max(50) 위반으로만 도달할 수 있다.
  const zodFail = await ctx.post('/api/identity/verify', { data: { name: '가'.repeat(51) } });
  expect(zodFail.status()).toBe(400);
  expect((await zodFail.json()).error).toBe('입력값을 확인해 주세요');

  const badPhone = await ctx.post('/api/identity/verify', {
    data: { name: '홍길동', phone: '12345' },
  });
  expect(badPhone.status()).toBe(400);
  expect((await badPhone.json()).error).toBe('인증된 휴대폰번호 형식이 올바르지 않습니다');

  const broken = await ctx.post('/api/identity/verify', {
    headers: { 'content-type': 'application/json' },
    data: Buffer.from('{"name":'),
  });
  expect(broken.status()).toBe(400);
  expect((await broken.json()).error).toBe('잘못된 요청입니다');
  await ctx.dispose();
});

test('identity/verify: 429 — 같은 IP 10분 10회 초과 (:16-28)', async () => {
  const ctx = await anonCtx('cust-identity-429');
  // 400 을 유발하는 빈 본문으로 태운다 — IdentityVerification 행을 만들지 않는다.
  for (let i = 1; i <= 10; i++) {
    const res = await ctx.post('/api/identity/verify', { data: {} });
    expect(res.status(), `${i}번째 요청은 아직 통과해야 한다`).toBe(400);
  }
  const limited = await ctx.post('/api/identity/verify', { data: {} });
  expect(limited.status()).toBe(429);
  // 본문이 바뀌었다는 것까지 확인해야 "그냥 계속 400" 이 아님이 증명된다.
  expect((await limited.json()).error).toBe('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
  await ctx.dispose();
});

// ───────────────────────────────────────────────────────────────────────────
// POST /api/referrer/lookup
// ───────────────────────────────────────────────────────────────────────────

test('referrer/lookup: 승인·활성 전기기사만 마스킹된 이름으로 노출된다', async () => {
  const ctx = await anonCtx('cust-referrer');
  const approved = await f.createTechFixture();
  const pending = await f.createTechFixture({ approvalStatus: 'PENDING' });

  const hit = await ctx.post('/api/referrer/lookup', { data: { phone: approved.phone } });
  expect(hit.status()).toBe(200);
  const matches = (await hit.json()).matches as Array<Record<string, unknown>>;
  const mine = matches.find((m) => m.userId === approved.userId);
  expect(mine, '승인·활성 전기기사가 조회되지 않았습니다').toBeTruthy();
  expect(mine!.type).toBe('전기기사');
  // maskName(:32-37) — 이름 원문이 그대로 노출되면 안 된다.
  expect(mine!.maskedName).not.toBe(approved.name);
  expect(String(mine!.maskedName)).toContain('○');

  const blocked = await ctx.post('/api/referrer/lookup', { data: { phone: pending.phone } });
  expect(blocked.status()).toBe(200);
  const blockedMatches = (await blocked.json()).matches as Array<Record<string, unknown>>;
  expect(blockedMatches.some((m) => m.userId === pending.userId)).toBe(false); // :80-83
  await ctx.dispose();
});

test('referrer/lookup: 400 — 전화번호 형식 / 미등록 번호는 빈 배열', async () => {
  const ctx = await anonCtx('cust-referrer-400');
  const bad = await ctx.post('/api/referrer/lookup', { data: { phone: 'abc' } });
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error).toBe('전화번호 형식이 올바르지 않습니다');

  const miss = await ctx.post('/api/referrer/lookup', { data: { phone: '0109009' + '111' } });
  expect(miss.status()).toBe(200);
  expect((await miss.json()).matches).toEqual([]);
  await ctx.dispose();
});
