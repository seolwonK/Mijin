import { expect, test, type APIRequestContext, type PlaywrightWorkerArgs } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { apiContextOptions } from '../helpers/auth';
import { ipHeaders } from '../helpers/ip';
import { FixtureFactory, type TechFixture } from '../helpers/fixtures';

// ───────────────────────────────────────────────────────────────────────────
// 전기기사 정산·성과·근로확인서 계약 (계획 5d)
//   GET  /api/tech/commissions   소개 수수료 원장 (referrerUserId = 세션 userId)
//   GET  /api/tech/referrals     내가 소개한 업체·전기기사 현황
//   GET  /api/tech/reviews       받은 후기 — n≥5 코멘트 임계
//   GET  /api/tech/stats         30일 배정·수락·평균 별점
//   GET  /api/tech/contract      없으면 DRAFT 생성 (임금 기본값 자동 기입)
//   PUT  /api/tech/contract      서명 = 확정. 재확정 409, 임금 미확정 409
//
// 집계 절대값은 **내가 만든 행 기준으로만** 단언한다. 공유 DB·병렬 워커에서
// 대역 전체/전역 카운트는 안전한 단언이 아니다(rev.5 하네스 결함 참조).
// ───────────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();
test.afterAll(async () => prisma.$disconnect());

let f: FixtureFactory;
test.beforeEach(() => {
  f = new FixtureFactory(prisma);
});
test.afterEach(async () => {
  await f.cleanupAll();
});

type Pw = PlaywrightWorkerArgs['playwright'];

async function techCtx(playwright: Pw, tech: TechFixture, seed: string): Promise<APIRequestContext> {
  return playwright.request.newContext(
    await apiContextOptions(
      'TECHNICIAN',
      { userId: tech.userId, technicianId: tech.technicianId },
      ipHeaders(seed),
    ),
  );
}

/** 존재하지 않는 전기기사를 가리키는 세션 — contract 404 분기 전용. */
async function ghostCtx(playwright: Pw, seed: string): Promise<APIRequestContext> {
  return playwright.request.newContext(
    await apiContextOptions(
      'TECHNICIAN',
      { userId: 'e2e-ghost-user', technicianId: 'e2e-ghost-technician' },
      ipHeaders(seed),
    ),
  );
}

/** 제출 완료된 만족도 조사 1건 (후기·평점 집계의 원천). */
async function submittedSurvey(technicianId: string, rating: number, comment: string | null) {
  const req = await f.createRequestFixture({ status: 'COMPLETED' });
  return prisma.satisfactionSurvey.create({
    data: {
      requestId: req.id,
      token: `e2e-${Math.random().toString(36).slice(2)}${Date.now()}`,
      technicianId,
      rating,
      comment,
      paidAmount: 100_000,
      submittedAt: new Date(),
    },
  });
}

// ── 수수료 ─────────────────────────────────────────────────────────────────

test.describe('GET /api/tech/commissions', () => {
  test('소개자 본인의 적립만 대기·지급 합계로 집계한다', async ({ playwright }) => {
    const me = await f.createTechFixture();
    const referee = await f.createTechFixture();
    const survey1 = await submittedSurvey(referee.technicianId, 5, null);
    const survey2 = await submittedSurvey(referee.technicianId, 4, null);

    await prisma.commissionEntry.create({
      data: {
        referrerUserId: me.userId,
        technicianId: referee.technicianId,
        surveyId: survey1.id,
        requestId: survey1.requestId,
        baseAmount: 100_000,
        amount: 2_000,
        status: 'PENDING',
      },
    });
    await prisma.commissionEntry.create({
      data: {
        referrerUserId: me.userId,
        technicianId: referee.technicianId,
        surveyId: survey2.id,
        requestId: survey2.requestId,
        baseAmount: 150_000,
        amount: 3_000,
        status: 'PAID',
        paidAt: new Date(),
      },
    });

    const ctx = await techCtx(playwright, me, 'comm-mine');
    const res = await ctx.get('/api/tech/commissions');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.pendingTotal).toBe(2_000);
    expect(body.paidTotal).toBe(3_000);
    const entries = body.entries as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(2);
    for (const e of entries) {
      expect(typeof e.id).toBe('string');
      expect(typeof e.refereeName).toBe('string');
      expect(['PENDING', 'PAID']).toContain(e.status);
    }
    expect(entries.map((e) => e.amount).sort()).toEqual([2_000, 3_000]);
    await ctx.dispose();
  });

  test('소개 이력이 없으면 0·빈 배열', async ({ playwright }) => {
    const me = await f.createTechFixture();
    const ctx = await techCtx(playwright, me, 'comm-empty');
    const body = await (await ctx.get('/api/tech/commissions')).json();
    expect(body).toEqual({ pendingTotal: 0, paidTotal: 0, entries: [] });
    await ctx.dispose();
  });
});

// ── 추천 현황 ──────────────────────────────────────────────────────────────

test.describe('GET /api/tech/referrals', () => {
  test('내가 소개한 전기기사가 승인상태·적립과 함께 나온다', async ({ playwright }) => {
    const me = await f.createTechFixture();
    const referee = await f.createTechFixture({ approvalStatus: 'APPROVED' });
    await prisma.technician.update({
      where: { id: referee.technicianId },
      data: { referredByUserId: me.userId },
    });
    // 미제출 조사 1건 = 설문 대기 1건 (적립 예정 금액은 절대 추정하지 않는다).
    const pendingReq = await f.createRequestFixture({ status: 'COMPLETED' });
    await prisma.satisfactionSurvey.create({
      data: {
        requestId: pendingReq.id,
        token: `e2e-${Math.random().toString(36).slice(2)}${Date.now()}`,
        technicianId: referee.technicianId,
      },
    });

    const ctx = await techCtx(playwright, me, 'ref-mine');
    const res = await ctx.get('/api/tech/referrals');
    expect(res.status()).toBe(200);
    const body = await res.json();
    const referees = body.referees as Array<Record<string, unknown>>;
    expect(referees).toHaveLength(1);
    expect(referees[0].id).toBe(referee.technicianId);
    expect(referees[0].kind).toBe('TECHNICIAN');
    expect(referees[0].approvalStatus).toBe('APPROVED');
    expect(referees[0].accruedPending).toBe(0);
    expect(referees[0].accruedPaid).toBe(0);
    expect(referees[0].pendingSurveyCount).toBe(1);
    expect(body.totals).toEqual({ refereeCount: 1, pendingSurveyCount: 1 });
    await ctx.dispose();
  });

  test('소개한 사람이 없으면 빈 개요', async ({ playwright }) => {
    const me = await f.createTechFixture();
    const ctx = await techCtx(playwright, me, 'ref-empty');
    const body = await (await ctx.get('/api/tech/referrals')).json();
    expect(body).toEqual({ referees: [], totals: { refereeCount: 0, pendingSurveyCount: 0 } });
    await ctx.dispose();
  });
});

// ── 받은 후기 ──────────────────────────────────────────────────────────────

test.describe('GET /api/tech/reviews', () => {
  test('후기 5건 미만이면 코멘트를 공개하지 않는다 (n≥5 임계)', async ({ playwright }) => {
    const me = await f.createTechFixture();
    await submittedSurvey(me.technicianId, 5, '친절했습니다');
    await submittedSurvey(me.technicianId, 3, '보통');

    const ctx = await techCtx(playwright, me, 'rev-under');
    const body = await (await ctx.get('/api/tech/reviews')).json();
    expect(body.reviewCount).toBe(2);
    expect(body.avgRating).toBeCloseTo(4);
    expect(body.distribution).toEqual({ 1: 0, 2: 0, 3: 1, 4: 0, 5: 1 });
    expect(body.comments).toEqual([]);
    await ctx.dispose();
  });

  test('후기 5건부터 코멘트가 공개되고 분포·평균이 맞는다', async ({ playwright }) => {
    const me = await f.createTechFixture();
    const ratings: Array<[number, string | null]> = [
      [5, '빠른 출동'],
      [5, null],
      [4, '깔끔'],
      [3, '보통'],
      [2, '아쉬움'],
    ];
    for (const [rating, comment] of ratings) {
      await submittedSurvey(me.technicianId, rating, comment);
    }

    const ctx = await techCtx(playwright, me, 'rev-over');
    const body = await (await ctx.get('/api/tech/reviews')).json();
    expect(body.reviewCount).toBe(5);
    expect(body.avgRating).toBeCloseTo(3.8);
    expect(body.distribution).toEqual({ 1: 0, 2: 1, 3: 1, 4: 1, 5: 2 });
    const comments = body.comments as Array<Record<string, unknown>>;
    expect(comments).toHaveLength(5);
    // 별점 내림차순 + 제출 시각 비노출 계약(portalStats.ts:60-77).
    expect(comments.map((c) => c.rating)).toEqual([5, 5, 4, 3, 2]);
    for (const c of comments) {
      expect(Object.keys(c).sort()).toEqual(['comment', 'rating']);
    }
    await ctx.dispose();
  });

  test('남의 후기는 섞이지 않는다', async ({ playwright }) => {
    const me = await f.createTechFixture();
    const other = await f.createTechFixture();
    await submittedSurvey(other.technicianId, 1, '남의 후기');

    const ctx = await techCtx(playwright, me, 'rev-scope');
    const body = await (await ctx.get('/api/tech/reviews')).json();
    expect(body.reviewCount).toBe(0);
    expect(body.avgRating).toBeNull();
    expect(body.distribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });

    // 양성 대조 — 내 후기를 하나 넣으면 같은 호출이 1 을 센다.
    // 없으면 위 0 은 "reviews 가 늘 0 을 준다" 는 결함과 구분되지 않는다.
    await submittedSurvey(me.technicianId, 4, '내 후기');
    const after = await (await ctx.get('/api/tech/reviews')).json();
    expect(after.reviewCount).toBe(1);
    expect(after.avgRating).toBeCloseTo(4);
    await ctx.dispose();
  });
});

// ── 성과 통계 ──────────────────────────────────────────────────────────────

test.describe('GET /api/tech/stats', () => {
  test('30일 배정은 수락+거절 합산, 수락은 수락만', async ({ playwright }) => {
    const me = await f.createTechFixture();
    const now = new Date();
    for (const status of ['ACCEPTED', 'ACCEPTED', 'REJECTED'] as const) {
      const req = await f.createRequestFixture();
      await prisma.assignment.create({
        data: {
          requestId: req.id,
          technicianId: me.technicianId,
          status,
          assignedBy: 'ADMIN',
          respondedAt: now,
        },
      });
    }
    // 응답하지 않은 배정은 respondedAt 이 null 이라 30일 집계에 들어가지 않는다.
    const pending = await f.createRequestFixture({ status: 'ASSIGNED' });
    await prisma.assignment.create({
      data: {
        requestId: pending.id,
        technicianId: me.technicianId,
        status: 'REQUESTED',
        assignedBy: 'ADMIN',
      },
    });

    const ctx = await techCtx(playwright, me, 'stats-30d');
    const res = await ctx.get('/api/tech/stats');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.assigned30d).toBe(3);
    expect(body.accepted30d).toBe(2);
    expect(body.avgRating).toBeNull();
    expect(body.reviewCount).toBe(0);
    await ctx.dispose();
  });

  test('후기가 있으면 실측 평균을 준다 (랭킹용 3.0 중립값이 아니다)', async ({ playwright }) => {
    const me = await f.createTechFixture();
    await submittedSurvey(me.technicianId, 5, null);
    await submittedSurvey(me.technicianId, 4, null);

    const ctx = await techCtx(playwright, me, 'stats-rating');
    const body = await (await ctx.get('/api/tech/stats')).json();
    expect(body.reviewCount).toBe(2);
    expect(body.avgRating).toBeCloseTo(4.5);
    await ctx.dispose();
  });
});

// ── 근로확인서 ─────────────────────────────────────────────────────────────

const signBody = (over: Record<string, unknown> = {}) => ({
  contractStartDate: new Date().toISOString().slice(0, 10),
  workLocation: '고객 현장 (출동)',
  jobDescription: '전기 설비 점검 및 출동 업무',
  workerAddress: '서울특별시 강남구 테헤란로 12',
  workerSignatureName: 'E2E 전기기사',
  workerSignatureDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
  ...over,
});

test.describe('GET /api/tech/contract', () => {
  test('근로확인서가 없으면 DRAFT 로 생성하고 근무조건·임금 기본값을 채운다', async ({
    playwright,
  }) => {
    const me = await f.createTechFixture({ employmentType: 'DAILY' });
    const ctx = await techCtx(playwright, me, 'contract-get-daily');

    const res = await ctx.get('/api/tech/contract');
    expect(res.status()).toBe(200);
    const c = (await res.json()).contract;
    expect(c.status).toBe('DRAFT');
    expect(c.employmentType).toBe('DAILY');
    // 근무조건은 서버가 근로형태로 강제한다(contractDefaults.ts:17-29).
    expect(c.workDays).toBe('근로개시일 당일');
    expect(c.workStartTime).toBe('09:00');
    expect(c.workEndTime).toBe('18:00');
    expect(c.hoursNote).toBe('1일 소정근로 8시간');
    expect(c.weeklyHoliday).toBeNull();
    // 임금은 항상 채워져 관리자를 기다리지 않고 바로 서명할 수 있어야 한다.
    expect(typeof c.wageAmount).toBe('number');
    expect(c.wageAmount).toBeGreaterThan(0);
    expect(c.wageType).toBe('DAILY');
    expect(c.contractStartDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(c.signedAt).toBeNull();
    await ctx.dispose();
  });

  test('상시 근로자는 주5일·주휴일 기본값을 받는다', async ({ playwright }) => {
    const me = await f.createTechFixture({ employmentType: 'PERMANENT' });
    const ctx = await techCtx(playwright, me, 'contract-get-perm');
    const c = (await (await ctx.get('/api/tech/contract')).json()).contract;
    expect(c.employmentType).toBe('PERMANENT');
    expect(c.workDays).toBe('월~금(주5일)');
    expect(c.weeklyHoliday).toBe('일요일');
    expect(c.wageType).toBe('MONTHLY');
    await ctx.dispose();
  });

  test('반복 조회해도 근로확인서는 1건만 생긴다 (멱등)', async ({ playwright }) => {
    const me = await f.createTechFixture();
    const ctx = await techCtx(playwright, me, 'contract-get-idem');
    expect((await ctx.get('/api/tech/contract')).status()).toBe(200);
    expect((await ctx.get('/api/tech/contract')).status()).toBe(200);
    expect(
      await prisma.employmentContract.count({ where: { technicianId: me.technicianId } }),
    ).toBe(1);
    await ctx.dispose();
  });

  test('전기기사 정보가 없으면 404 (contract/route.ts:118-120)', async ({ playwright }) => {
    const ghost = await ghostCtx(playwright, 'contract-get-404');
    const res = await ghost.get('/api/tech/contract');
    expect(res.status()).toBe(404);
    expect((await res.json()).error).toBe('전기기사 정보를 찾을 수 없습니다');
    await ghost.dispose();

    // 양성 대조 — 실재하는 전기기사에게는 같은 GET 이 200 이다.
    const me = await f.createTechFixture();
    const real = await techCtx(playwright, me, 'contract-get-404-control');
    expect((await real.get('/api/tech/contract')).status()).toBe(200);
    await real.dispose();
  });
});

test.describe('PUT /api/tech/contract', () => {
  test('서명하면 즉시 CONFIRMED 가 되고 일일 근로자는 계약기간이 당일이다', async ({
    playwright,
  }) => {
    const me = await f.createTechFixture({ employmentType: 'DAILY' });
    const ctx = await techCtx(playwright, me, 'contract-put-daily');
    const today = new Date().toISOString().slice(0, 10);

    const res = await ctx.put('/api/tech/contract', { data: signBody({ contractStartDate: today }) });
    expect(res.status()).toBe(200);
    const c = (await res.json()).contract;
    expect(c.status).toBe('CONFIRMED');
    expect(c.contractStartDate).toBe(today);
    expect(c.contractEndDate).toBe(today); // DAILY = 근로개시일 당일
    expect(c.signedAt).not.toBeNull();
    expect(c.submittedAt).not.toBeNull();
    expect(c.workerSignatureDataUrl).toBe('data:image/png;base64,iVBORw0KGgo=');

    const row = await prisma.employmentContract.findUnique({
      where: { technicianId: me.technicianId },
      select: { status: true, confirmedAt: true },
    });
    expect(row?.status).toBe('CONFIRMED');
    expect(row?.confirmedAt).not.toBeNull();
    await ctx.dispose();
  });

  test('상시 근로자는 계약종료일이 없다', async ({ playwright }) => {
    const me = await f.createTechFixture({ employmentType: 'PERMANENT' });
    const ctx = await techCtx(playwright, me, 'contract-put-perm');
    const c = (await (await ctx.put('/api/tech/contract', { data: signBody() })).json()).contract;
    expect(c.status).toBe('CONFIRMED');
    expect(c.contractEndDate).toBeNull();
    // 클라이언트가 무엇을 보내든 근무조건은 서버가 다시 세팅한다.
    expect(c.workDays).toBe('월~금(주5일)');
    await ctx.dispose();
  });

  test('확정된 근로확인서는 다시 고칠 수 없다 → 409 (contract/route.ts:149-154)', async ({
    playwright,
  }) => {
    const me = await f.createTechFixture();
    const ctx = await techCtx(playwright, me, 'contract-put-409');
    expect((await ctx.put('/api/tech/contract', { data: signBody() })).status()).toBe(200);
    const again = await ctx.put('/api/tech/contract', { data: signBody() });
    expect(again.status()).toBe(409);
    expect((await again.json()).error).toContain('이미 확정된 근로확인서');
    await ctx.dispose();
  });

  test('임금이 비어 있으면 서명할 수 없다 → 409 (contract/route.ts:157-162)', async ({
    playwright,
  }) => {
    // SUBMITTED 상태는 loadOrCreate 의 DRAFT 임금 소급 분기(:54-74)를 타지 않으므로
    // wageAmount 가 null 로 남는다 — 이 409 에 도달하는 유일한 경로다.
    const me = await f.createTechFixture({ contractStatus: 'SUBMITTED' });
    expect(
      (
        await prisma.employmentContract.findUnique({
          where: { technicianId: me.technicianId },
          select: { wageAmount: true },
        })
      )?.wageAmount,
    ).toBeNull();

    const ctx = await techCtx(playwright, me, 'contract-put-nowage');
    const res = await ctx.put('/api/tech/contract', { data: signBody() });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toContain('임금이 확정되지 않았습니다');
    await ctx.dispose();
  });

  test('잘못된 JSON → 400 (contract/route.ts:131-135)', async ({ playwright }) => {
    const me = await f.createTechFixture();
    const ctx = await techCtx(playwright, me, 'contract-put-badjson');
    const res = await ctx.put('/api/tech/contract', {
      headers: { 'content-type': 'application/json' },
      data: '{ broken',
    });
    expect(res.status()).toBe(400);
    await ctx.dispose();
  });

  test('zod 경계 — 서명·필수항목·날짜 형식은 400 (contract.ts:5-20)', async ({ playwright }) => {
    const me = await f.createTechFixture();
    const ctx = await techCtx(playwright, me, 'contract-put-zod');
    // PUT 은 바디 파싱(400)이 loadOrCreate 보다 **먼저**다 — 400 만으로는 계약 행이
    // 만들어지지 않는다. 아래 마지막 단언이 의미를 갖도록 GET 으로 DRAFT 를 먼저 만든다.
    expect((await ctx.get('/api/tech/contract')).status()).toBe(200);
    // 각 케이스는 **한 필드만** 깨뜨리고 그 필드의 zod 메시지를 그대로 단언한다.
    // 라우트가 issues[0] 만 돌려주므로(:139), 메시지까지 못박아야 "다른 필드가 대신
    // 걸려서 400 이 났는데 통과" 하는 오탐을 막을 수 있다.
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['서명 없음', { workerSignatureDataUrl: '' }, '서명을 해 주세요'],
      [
        '서명이 data URL 이 아님',
        { workerSignatureDataUrl: 'https://example.com/sign.png' },
        '서명을 해 주세요',
      ],
      ['근로개시일 공백', { contractStartDate: '   ' }, '근로개시일을 입력해 주세요'],
      ['근로개시일 형식', { contractStartDate: '어제' }, '날짜 형식이 올바르지 않습니다'],
      ['근무장소 공백', { workLocation: '  ' }, '근무장소를 입력해 주세요'],
      ['업무 내용 공백', { jobDescription: '' }, '업무 내용을 입력해 주세요'],
      ['성명 공백', { workerSignatureName: '' }, '성명을 입력해 주세요'],
      ['주소 공백', { workerAddress: '' }, '주소를 입력해 주세요'],
    ];
    for (const [label, over, message] of cases) {
      const res = await ctx.put('/api/tech/contract', { data: signBody(over) });
      expect(res.status(), label).toBe(400);
      expect((await res.json()).error, label).toBe(message);
    }
    // 8번의 400 이후에도 계약은 여전히 미확정이어야 한다 (부수효과 없음).
    // ⚠️ 순서 주의 — 아래 양성 대조가 계약을 CONFIRMED 로 만들므로 반드시 그 **앞**에서 본다.
    expect(
      (
        await prisma.employmentContract.findUnique({
          where: { technicianId: me.technicianId },
          select: { status: true },
        })
      )?.status,
    ).toBe('DRAFT');

    // 양성 대조 — 온전한 바디는 같은 엔드포인트에서 200 이다(위 400 들이 "PUT 이 늘 400" 이 아님).
    expect((await ctx.put('/api/tech/contract', { data: signBody() })).status()).toBe(200);
    await ctx.dispose();
  });

  test('전기기사 정보가 없으면 404 (contract/route.ts:146-148)', async ({ playwright }) => {
    // 바디가 **유효해야** zod(:137-142)를 지나 loadOrCreate 의 404 까지 온다.
    // 빈 바디로 보냈다면 400 이 나고 이 분기는 실행조차 되지 않았을 것이다.
    const ghost = await ghostCtx(playwright, 'contract-put-404');
    const res = await ghost.put('/api/tech/contract', { data: signBody() });
    expect(res.status()).toBe(404);
    // 가려짐 실증 — 같은 유령 세션이라도 바디가 깨지면 404 이전에 400 이 난다.
    const shadowed = await ghost.put('/api/tech/contract', { data: {} });
    expect(shadowed.status()).toBe(400);
    await ghost.dispose();

    // 양성 대조 — **같은 바디**를 실재하는 전기기사로 보내면 200 이다.
    const me = await f.createTechFixture();
    const real = await techCtx(playwright, me, 'contract-put-404-control');
    expect((await real.put('/api/tech/contract', { data: signBody() })).status()).toBe(200);
    await real.dispose();
  });
});
