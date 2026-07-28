import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { FixtureFactory, type PartnerFixture } from '../helpers/fixtures';
import { expectGate } from '../helpers/gates';
import { partnerCtx, surveyToken, validBizRegNo } from './helpers';

// ───────────────────────────────────────────────────────────────────────────
// 업체 본인 조회·수정 — 계획 Step 6d
//
//   GET/PATCH /api/partner/profile   · GET /api/partner/commissions
//   GET /api/partner/referrals       · GET /api/partner/reviews
//   GET /api/partner/stats
//
// 이 5개 라우트는 전부 **세션에서 주체를 도출**하고 id 파라미터를 받지 않는다
// (stats/route.ts:5-6 의 주석이 명시). 즉 소유권 위반 경로가 구조적으로 없어
// 여기서는 "남의 데이터가 섞이지 않는가" 를 데이터 격리로 확인한다 —
// 대역 전체 카운트는 병렬 워커에서 안전하지 않으므로 전부 **내 id 스코프**다.
// ───────────────────────────────────────────────────────────────────────────

// 분기 지도의 정식 키.
const PROFILE_GET = 'GET /api/partner/profile';
const PROFILE_PATCH = 'PATCH /api/partner/profile';

const prisma = new PrismaClient();
test.afterAll(async () => prisma.$disconnect());

let f: FixtureFactory;
test.beforeEach(() => {
  f = new FixtureFactory(prisma);
});
test.afterEach(async () => {
  await f.cleanupAll();
});

/**
 * 제출 완료된 후기 1건 — 접수·조사를 한 벌로 만든다(조사는 requestId 가 @unique).
 *
 * ⚠️ `submittedAt` 을 **2026-05 로 고정**한다. 현재 KST 월(`new Date()`)로 두면
 * `tests/admin-settlements.spec.ts` 를 붉게 만든다: 그 스펙은 `month=2026-07` 을
 * 하드코딩하고 CSV 3줄·업체 '2건'·기술자 '해당 기간 집계 데이터 없음' 을 기대하는데,
 * settlementReport.ts:131-140 의 소스 행 필터가 정확히 `submittedAt ∈ KST월 범위`
 * + `paidAmount != null` 이라 여기서 만든 행이 그대로 섞여 든다.
 * `paidAmount` 를 null 로 두는 것으로는 부족하다 — :110 의 `completedWhere` 는
 * paidAmount 를 보지 않고 제출 건수만 세므로 '2건' 단언이 먼저 깨진다.
 * 그 11개 스펙은 수정 금지 대상이므로 회피는 이쪽 책임이다.
 * (2026-05 가 비어 있음을 실측 확인: 제출된 조사는 2026-07 의 2건이 전부)
 *
 * 이 백데이팅은 본 파일의 단언에 영향을 주지 않는다 — portalStats.ts:32-36 과
 * :64-67 은 `submittedAt: {not: null}` 만 볼 뿐 기간 필터가 없다.
 */
const BACKDATED_SUBMIT = new Date('2026-05-15T00:00:00.000Z');

async function submittedReview(partner: PartnerFixture, rating: number, comment: string | null) {
  const req = await f.createRequestFixture({ status: 'COMPLETED' });
  return prisma.satisfactionSurvey.create({
    data: {
      requestId: req.id,
      token: surveyToken(),
      providerId: partner.providerId,
      rating,
      comment,
      paidAmount: 100_000,
      submittedAt: BACKDATED_SUBMIT,
    },
  });
}

// ── profile ────────────────────────────────────────────────────────────────

test('GET /api/partner/profile 는 계약된 필드만 돌려준다 (route.ts:34-43)', async ({
  playwright,
}) => {
  // bizRegNo 는 @unique — 상수를 박으면 크래시 잔재가 다음 실행을 막는다.
  const bizRegNo = validBizRegNo();
  const partner = await f.createPartnerFixture({
    address: '서울특별시 강남구 테헤란로 152',
    regions: ['서울특별시 강남구'],
    bizRegNo,
  });
  const ctx = await partnerCtx(playwright, partner, 'profile-get');
  const res = await ctx.get('/api/partner/profile');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Object.keys(body).sort()).toEqual(
    [
      'address',
      'approvalStatus',
      'bizRegNo',
      'isActive',
      'loginId',
      'name',
      'phone',
      'regions',
    ].sort(),
  );
  expect(body.loginId).toBe(partner.loginId);
  expect(body.phone).toBe(partner.phone);
  expect(body.approvalStatus).toBe('APPROVED');
  expect(body.regions).toEqual(['서울특별시 강남구']);
  expect(body.bizRegNo).toBe(bizRegNo);
  await ctx.dispose();
});

test('PATCH 400 — 잘못된 JSON(:55) · 전화번호 형식(:59-62)', async ({ playwright }) => {
  const partner = await f.createPartnerFixture();
  const ctx = await partnerCtx(playwright, partner, 'profile-patch-400');

  // Buffer 로 줘야 원문이 그대로 나간다 — 문자열은 Playwright 가 JSON 직렬화해버려
  // req.json() 이 성공하고 :55 가 아니라 zod 분기(:58)로 빠진다.
  const badJson = await ctx.fetch('/api/partner/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    data: Buffer.from('{'),
  });
  const parseGate = expectGate(PROFILE_PATCH, 55);
  expect(badJson.status()).toBe(parseGate.status);
  expect((await badJson.json()).error).toBe(parseGate.message);

  const badPhone = await ctx.fetch('/api/partner/profile', {
    method: 'PATCH',
    data: { phone: '12345' },
  });
  // :61 은 zod 문구를 그대로 흘려보내므로 gates.ts 의 message 가 null 이다.
  // 상태코드만 게이트로 고정하고 문구는 patchSchema:15 의 리터럴로 직접 대조한다.
  // `{}` 로는 이 분기에 닿지 않는다 — 전 필드 optional 이라 200(무변경)이 된다.
  expect(badPhone.status()).toBe(expectGate(PROFILE_PATCH, 61).status);
  expect((await badPhone.json()).error).toBe('전화번호 형식이 올바르지 않습니다');

  // 400 이 부분 반영으로 새지 않았다.
  const row = await prisma.user.findUnique({ where: { id: partner.userId } });
  expect(row?.phone).toBe(partner.phone);

  // 양성대조 — 같은 컨텍스트에서 유효 본문은 200 이다. 없으면 위 400 들이
  // "PATCH 가 늘 400" 이라는 하네스 결함과 구분되지 않는다.
  const ok = await ctx.fetch('/api/partner/profile', {
    method: 'PATCH',
    data: { isActive: false },
  });
  expect(ok.status(), '앞선 400 은 전부 본문 때문이었다').toBe(200);
  await ctx.dispose();
});

test('profile 404 — 세션의 providerId 가 실재하지 않으면 GET(:31-33)·PATCH(:69-71)', async ({
  playwright,
}) => {
  // requireSession 은 토큰만 검증하고 providerId 의 **실재 여부**는 각 라우트가 확인한다
  // (middleware.ts:46-48 의 matcher 에 /api/* 가 없어 API 권한은 전적으로 라우트 책임).
  // 삭제된 업체의 세션이 만료 전까지 살아 있는 상황이 이 분기에 해당한다.
  const ghost = { userId: 'e2e-ghost-user', providerId: 'no-such-provider' };
  const ctx = await partnerCtx(playwright, ghost, 'profile-404');

  const getGate = expectGate(PROFILE_GET, 32);
  const get = await ctx.get('/api/partner/profile');
  expect(get.status()).toBe(getGate.status);
  expect((await get.json()).error).toBe(getGate.message);

  // PATCH 는 json → zod → findUnique 순서라, 404 에 닿으려면 본문이 유효해야 한다.
  const patch = await ctx.fetch('/api/partner/profile', {
    method: 'PATCH',
    data: { isActive: true },
  });
  const patchGate = expectGate(PROFILE_PATCH, 70);
  expect(patch.status()).toBe(patchGate.status);
  expect((await patch.json()).error).toBe(patchGate.message);
  await ctx.dispose();
});

test('PATCH 200 — 전화·주소·지역·영업상태가 실제로 반영되고 지역은 화이트리스트로 걸러진다', async ({
  playwright,
}) => {
  const partner = await f.createPartnerFixture();
  const ctx = await partnerCtx(playwright, partner, 'profile-patch-200');

  const res = await ctx.fetch('/api/partner/profile', {
    method: 'PATCH',
    data: {
      phone: '010-9001-7777',
      address: '서울특별시 서초구 서초대로 396',
      // sanitizeRegionKeys(regions.ts:100-109) 가 유효 키만 남긴다.
      regions: ['서울특별시 강남구', '경기도', 'NOT_A_REGION', '서울특별시 없는구'],
      isActive: false,
    },
  });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });

  const provider = await prisma.provider.findUnique({ where: { id: partner.providerId } });
  expect(provider?.address).toBe('서울특별시 서초구 서초대로 396');
  expect(provider?.regions).toEqual(['서울특별시 강남구', '경기도']);
  expect(provider?.isActive).toBe(false);
  // 전화번호는 비숫자를 떨어낸 형태로 저장된다 (patchSchema:12-16).
  expect((await prisma.user.findUnique({ where: { id: partner.userId } }))?.phone).toBe(
    '01090017777',
  );
  // 좌표는 카카오 실호출 결과라 값 자체는 단언하지 않는다(계획 R8) — 키 존재만 확인한다.
  expect(provider).toHaveProperty('lat');
  expect(provider).toHaveProperty('lng');

  // 신원 정보(업체명·아이디·사업자번호)는 이 라우트로 바뀌지 않는다(route.ts:8-9).
  const after = await ctx.get('/api/partner/profile');
  expect((await after.json()).name).toBe(partner.name);
  await ctx.dispose();
});

// ── commissions ────────────────────────────────────────────────────────────

test('GET /api/partner/commissions 는 내가 소개자인 적립만 합산한다', async ({ playwright }) => {
  const partner = await f.createPartnerFixture();
  const referee = await f.createPartnerFixture();
  const other = await f.createPartnerFixture();

  const mine = await submittedReview(referee, 5, null);
  const notMine = await submittedReview(other, 4, null);
  await prisma.commissionEntry.createMany({
    data: [
      {
        referrerUserId: partner.userId,
        providerId: referee.providerId,
        surveyId: mine.id,
        requestId: mine.requestId,
        baseAmount: 100_000,
        amount: 2_000,
        status: 'PENDING',
      },
      {
        // 남의 소개 건 — 합계에 섞이면 안 된다.
        referrerUserId: other.userId,
        providerId: other.providerId,
        surveyId: notMine.id,
        requestId: notMine.requestId,
        baseAmount: 200_000,
        amount: 4_000,
        status: 'PAID',
      },
    ],
  });

  const ctx = await partnerCtx(playwright, partner, 'commissions');
  const res = await ctx.get('/api/partner/commissions');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.pendingTotal).toBe(2_000);
  expect(body.paidTotal).toBe(0);
  const ids = (body.entries as Array<{ id: string; amount: number }>).map((e) => e.id);
  expect(ids).toHaveLength(1);
  expect(body.entries[0]).toMatchObject({ amount: 2_000, status: 'PENDING' });
  expect(body.entries[0].refereeName).toBe(referee.name);
  // commissionDisplay.ts:40 은 enum 이 아니라 표시용 한글 라벨을 넣는다.
  expect(body.entries[0].refereeType).toBe('업체');
  await ctx.dispose();
});

// ── referrals ──────────────────────────────────────────────────────────────

test('GET /api/partner/referrals 는 내가 소개한 업체·기술자만 보여준다', async ({ playwright }) => {
  const partner = await f.createPartnerFixture();
  const referredPartner = await f.createPartnerFixture({ approvalStatus: 'PENDING' });
  const referredTech = await f.createTechFixture();
  const unrelated = await f.createPartnerFixture();

  await prisma.provider.update({
    where: { id: referredPartner.providerId },
    data: { referredByUserId: partner.userId },
  });
  await prisma.technician.update({
    where: { id: referredTech.technicianId },
    data: { referredByUserId: partner.userId },
  });

  // 미제출 조사 1건 — pendingSurveyCount 가 실제로 세어지는지 확인한다.
  const req = await f.createRequestFixture({ status: 'COMPLETED' });
  await prisma.satisfactionSurvey.create({
    data: {
      requestId: req.id,
      token: surveyToken(),
      providerId: referredPartner.providerId,
    },
  });

  const ctx = await partnerCtx(playwright, partner, 'referrals');
  const res = await ctx.get('/api/partner/referrals');
  expect(res.status()).toBe(200);
  const body = await res.json();
  const ids = (body.referees as Array<{ id: string }>).map((r) => r.id);
  expect(ids.sort()).toEqual([referredPartner.providerId, referredTech.technicianId].sort());
  expect(ids).not.toContain(unrelated.providerId);
  expect(body.totals.refereeCount).toBe(2);
  expect(body.totals.pendingSurveyCount).toBe(1);

  const referee = (body.referees as Array<Record<string, unknown>>).find(
    (r) => r.id === referredPartner.providerId,
  )!;
  expect(referee.kind).toBe('PROVIDER');
  expect(referee.approvalStatus).toBe('PENDING');
  expect(referee.accruedPending).toBe(0);
  expect(referee.pendingSurveyCount).toBe(1);
  await ctx.dispose();
});

// ── reviews ────────────────────────────────────────────────────────────────

test('GET /api/partner/reviews — n<5 는 집계만, n≥5 부터 코멘트가 열린다 (route.ts:9, :30)', async ({
  playwright,
}) => {
  const partner = await f.createPartnerFixture();
  const ctx = await partnerCtx(playwright, partner, 'reviews');

  // 0건
  const empty = await ctx.get('/api/partner/reviews');
  expect(empty.status()).toBe(200);
  expect(await empty.json()).toEqual({
    reviewCount: 0,
    avgRating: null,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    comments: [],
  });

  // 4건 — 임계 미만이라 코멘트는 여전히 닫혀 있다.
  for (const rating of [5, 4, 3, 2]) await submittedReview(partner, rating, `후기 ${rating}`);
  const under = await ctx.get('/api/partner/reviews');
  const underBody = await under.json();
  expect(underBody.reviewCount).toBe(4);
  expect(underBody.avgRating).toBe(3.5);
  expect(underBody.distribution).toEqual({ 1: 0, 2: 1, 3: 1, 4: 1, 5: 1 });
  expect(underBody.comments, 'n<5 에서는 코멘트가 노출되지 않는다').toEqual([]);

  // 5건째 — 임계 도달
  await submittedReview(partner, 1, '아쉬웠어요');
  const over = await ctx.get('/api/partner/reviews');
  const overBody = await over.json();
  expect(overBody.reviewCount).toBe(5);
  expect(overBody.distribution).toEqual({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 });
  expect(overBody.comments).toHaveLength(5);
  // 계약상 rating·comment 만 나간다 — requestId·submittedAt·고객 필드는 select 자체에서 빠진다
  // (portalStats.ts:60-67). 여기가 늘어나면 역추적 방지 계약이 깨진 것이다.
  for (const c of overBody.comments as Array<Record<string, unknown>>) {
    expect(Object.keys(c).sort()).toEqual(['comment', 'rating']);
  }
  expect((overBody.comments as Array<{ rating: number }>).map((c) => c.rating)).toEqual([
    5, 4, 3, 2, 1,
  ]);
  await ctx.dispose();
});

// ── stats ──────────────────────────────────────────────────────────────────

test('GET /api/partner/stats — 30일 배정·수락·평점 집계 (portalStats.ts:19-45)', async ({
  playwright,
}) => {
  const partner = await f.createPartnerFixture();
  const other = await f.createPartnerFixture();
  const ctx = await partnerCtx(playwright, partner, 'stats');

  const zero = await ctx.get('/api/partner/stats');
  expect(zero.status()).toBe(200);
  expect(await zero.json()).toEqual({
    assigned30d: 0,
    accepted30d: 0,
    avgRating: null,
    reviewCount: 0,
  });

  const req = await f.createRequestFixture({ status: 'COMPLETED' });
  const now = new Date();
  await prisma.assignment.createMany({
    data: [
      {
        requestId: req.id,
        providerId: partner.providerId,
        status: 'ACCEPTED',
        assignedBy: 'ADMIN',
        respondedAt: now,
      },
      {
        requestId: req.id,
        providerId: partner.providerId,
        status: 'REJECTED',
        assignedBy: 'ADMIN',
        respondedAt: now,
      },
      {
        // 31일 전 응답 — cutoff 밖이라 세면 안 된다.
        requestId: req.id,
        providerId: partner.providerId,
        status: 'ACCEPTED',
        assignedBy: 'ADMIN',
        respondedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      },
      {
        // 남의 배정
        requestId: req.id,
        providerId: other.providerId,
        status: 'ACCEPTED',
        assignedBy: 'ADMIN',
        respondedAt: now,
      },
    ],
  });
  await submittedReview(partner, 4, null);
  await submittedReview(partner, 2, null);

  const res = await ctx.get('/api/partner/stats');
  const body = await res.json();
  expect(body.assigned30d, '수락+거절 합산, 30일 컷오프 안쪽만').toBe(2);
  expect(body.accepted30d).toBe(1);
  expect(body.reviewCount).toBe(2);
  expect(body.avgRating).toBe(3);
  await ctx.dispose();
});
