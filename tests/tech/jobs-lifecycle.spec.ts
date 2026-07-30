import { expect, test, type APIRequestContext, type PlaywrightWorkerArgs } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { apiContextOptions } from '../helpers/auth';
import { ipHeaders } from '../helpers/ip';
import { FixtureFactory, type TechFixture } from '../helpers/fixtures';

// ───────────────────────────────────────────────────────────────────────────
// 배정 생애주기 (계획 5c) — 목록 스코프 / 수락·거절 CAS / 상태 3전이.
//
// R9 (fire-and-forget): status/route.ts:64 의 `void createSurveyAndNotify(...)` 는
// **응답 이후** SatisfactionSurvey 행을 만들고, 그 안에서 survey.ts:42 가 **다시**
// `void sendSms(...)` 를 던진다 (2중 지연). 따라서 설문 행과 그 설문의 SmsLog 는
// 하나의 poll 로 묶을 수 없다 — 각각 따로 기다린다.
//
// 배정 픽스처는 prisma 로 직접 만든다. 제품의 createAssignment 를 쓰면 배정 안내
// SMS 가 함께 나가 완료 설문 SmsLog 단언의 잡음이 되기 때문이다(assignment.ts:46).
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

type AssignmentStatus = 'REQUESTED' | 'ACCEPTED' | 'REJECTED' | 'CANCELED';

async function makeAssignment(
  technicianId: string,
  requestId: string,
  status: AssignmentStatus = 'REQUESTED',
  assignedBy: 'ADMIN' | 'AUTO' = 'ADMIN',
) {
  return prisma.assignment.create({
    data: {
      requestId,
      technicianId,
      status,
      assignedBy,
      ...(status === 'REQUESTED' ? {} : { respondedAt: new Date() }),
    },
  });
}

const requestStatus = async (id: string) =>
  (await prisma.serviceRequest.findUnique({ where: { id }, select: { status: true } }))?.status;
const assignmentStatus = async (id: string) =>
  (await prisma.assignment.findUnique({ where: { id }, select: { status: true } }))?.status;

// ── 목록 스코프 ────────────────────────────────────────────────────────────

test.describe('GET /api/tech/jobs', () => {
  test('본인 배정만 반환한다 (jobs/route.ts:11-16)', async ({ playwright }) => {
    const me = await f.createTechFixture();
    const other = await f.createTechFixture();
    const req = await f.createRequestFixture({ status: 'ASSIGNED' });
    const mine = await makeAssignment(me.technicianId, req.id);
    const theirs = await makeAssignment(other.technicianId, req.id);

    const ctx = await techCtx(playwright, me, 'jobs-scope');
    const res = await ctx.get('/api/tech/jobs');
    expect(res.status()).toBe(200);
    const ids = ((await res.json()).jobs as Array<{ id: string }>).map((j) => j.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(theirs.id);
    await ctx.dispose();
  });

  test('목록 항목은 배정 + 접수 요약 계약을 지킨다', async ({ playwright }) => {
    const me = await f.createTechFixture();
    const req = await f.createRequestFixture({
      status: 'ASSIGNED',
      urgency: 'URGENT',
      description: 'E2E 생애주기 점검',
      address: '서울특별시 강남구 테헤란로 1',
    });
    const a = await makeAssignment(me.technicianId, req.id);

    const ctx = await techCtx(playwright, me, 'jobs-shape');
    const res = await ctx.get('/api/tech/jobs');
    const job = ((await res.json()).jobs as Array<Record<string, unknown>>).find(
      (j) => j.id === a.id,
    );
    expect(job).toBeDefined();
    expect(job!.status).toBe('REQUESTED');
    expect(job!.assignedBy).toBe('ADMIN');
    expect(job!.rejectReason).toBeNull();
    const request = job!.request as Record<string, unknown>;
    expect(request.id).toBe(req.id);
    expect(request.status).toBe('ASSIGNED');
    expect(request.urgency).toBe('URGENT');
    expect(request.description).toBe('E2E 생애주기 점검');
    expect(request.address).toBe('서울특별시 강남구 테헤란로 1');
    // 목록에는 고객 연락처가 없다 — 상세(jobs/[id])에서만 노출된다.
    expect(request).not.toHaveProperty('customerPhone');
    await ctx.dispose();
  });

  test('GET /api/tech/jobs/[id] 는 상세에서 고객 연락처를 준다', async ({ playwright }) => {
    const me = await f.createTechFixture();
    const req = await f.createRequestFixture({ status: 'ASSIGNED' });
    const a = await makeAssignment(me.technicianId, req.id);

    const ctx = await techCtx(playwright, me, 'jobs-detail');
    const res = await ctx.get(`/api/tech/jobs/${a.id}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(a.id);
    expect(body.request.customerName).toBe(req.customerName);
    expect(body.request.customerPhone).toBe(req.customerPhone);

    expect((await ctx.get('/api/tech/jobs/e2e-no-such-assignment')).status()).toBe(404);
    await ctx.dispose();
  });
});

// ── 수락 / 거절 ────────────────────────────────────────────────────────────

test.describe('POST /api/tech/jobs/[id]/accept', () => {
  test('수락하면 배정과 접수가 함께 ACCEPTED 로 간다', async ({ playwright }) => {
    const me = await f.createTechFixture();
    const req = await f.createRequestFixture({ status: 'ASSIGNED' });
    const a = await makeAssignment(me.technicianId, req.id);

    const ctx = await techCtx(playwright, me, 'accept-happy');
    const res = await ctx.post(`/api/tech/jobs/${a.id}/accept`);
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await assignmentStatus(a.id)).toBe('ACCEPTED');
    expect(await requestStatus(req.id)).toBe('ACCEPTED');
    expect(
      (await prisma.assignment.findUnique({ where: { id: a.id }, select: { respondedAt: true } }))
        ?.respondedAt,
    ).not.toBeNull();
    await ctx.dispose();
  });

  test('재수락은 409 (accept/route.ts:28-30 의 CAS)', async ({ playwright }) => {
    const me = await f.createTechFixture();
    const req = await f.createRequestFixture({ status: 'ASSIGNED' });
    const a = await makeAssignment(me.technicianId, req.id);

    const ctx = await techCtx(playwright, me, 'accept-409');
    expect((await ctx.post(`/api/tech/jobs/${a.id}/accept`)).status()).toBe(200);
    const again = await ctx.post(`/api/tech/jobs/${a.id}/accept`);
    expect(again.status()).toBe(409);
    expect((await again.json()).error).toContain('이미 처리된 배정');
    await ctx.dispose();
  });

  test('거절된 배정은 수락할 수 없다 (409)', async ({ playwright }) => {
    const me = await f.createTechFixture();
    const req = await f.createRequestFixture({ status: 'ASSIGNED' });
    const rejected = await makeAssignment(me.technicianId, req.id, 'REJECTED');
    const fresh = await makeAssignment(me.technicianId, req.id, 'REQUESTED');

    const ctx = await techCtx(playwright, me, 'accept-rejected');
    expect((await ctx.post(`/api/tech/jobs/${rejected.id}/accept`)).status()).toBe(409);
    // 양성 대조 — 같은 전기기사·같은 접수의 REQUESTED 배정은 수락된다.
    // 이게 없으면 위 409 가 "accept 가 늘 409" 인 결함과 구분되지 않는다.
    expect((await ctx.post(`/api/tech/jobs/${fresh.id}/accept`)).status()).toBe(200);
    await ctx.dispose();
  });

  test('없는 배정 → 404', async ({ playwright }) => {
    const me = await f.createTechFixture();
    const req = await f.createRequestFixture({ status: 'ASSIGNED' });
    const real = await makeAssignment(me.technicianId, req.id);

    const ctx = await techCtx(playwright, me, 'accept-404');
    expect((await ctx.post('/api/tech/jobs/e2e-no-such/accept')).status()).toBe(404);
    // 양성 대조 — 실제 존재하는 내 배정은 같은 호출로 200 이 된다.
    expect((await ctx.post(`/api/tech/jobs/${real.id}/accept`)).status()).toBe(200);
    await ctx.dispose();
  });
});

test.describe('POST /api/tech/jobs/[id]/reject', () => {
  test('수동배정 거절은 접수를 RECEIVED 로 되돌리고 needsAttention 을 켠다', async ({
    playwright,
  }) => {
    const me = await f.createTechFixture();
    const req = await f.createRequestFixture({ status: 'ASSIGNED' });
    const a = await makeAssignment(me.technicianId, req.id, 'REQUESTED', 'ADMIN');

    const ctx = await techCtx(playwright, me, 'reject-manual');
    const res = await ctx.post(`/api/tech/jobs/${a.id}/reject`, { data: { reason: '거리 초과' } });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true, reassigned: false });
    expect(await assignmentStatus(a.id)).toBe('REJECTED');
    const after = await prisma.serviceRequest.findUnique({
      where: { id: req.id },
      select: { status: true, needsAttention: true },
    });
    expect(after?.status).toBe('RECEIVED');
    expect(after?.needsAttention).toBe(true);
    expect(
      (await prisma.assignment.findUnique({ where: { id: a.id }, select: { rejectReason: true } }))
        ?.rejectReason,
    ).toBe('거리 초과');

    // 단언이 끝나면 즉시 RECEIVED 를 걷는다. 자동배정 워커는 가드가 꺼 뒀지만,
    // global-teardown 의 복원 게이트가 RECEIVED 잔재를 보고 복원을 보류하므로
    // cleanupAll 이전에도 창을 최대한 좁힌다.
    await prisma.serviceRequest.update({
      where: { id: req.id },
      data: { status: 'CANCELED', needsAttention: false },
    });
    await ctx.dispose();
  });

  test('바디 없이 거절해도 200 (reject/route.ts:26-28)', async ({ playwright }) => {
    const me = await f.createTechFixture();
    const req = await f.createRequestFixture({ status: 'ASSIGNED' });
    const a = await makeAssignment(me.technicianId, req.id);

    const ctx = await techCtx(playwright, me, 'reject-nobody');
    const res = await ctx.post(`/api/tech/jobs/${a.id}/reject`);
    expect(res.status()).toBe(200);
    expect(
      (await prisma.assignment.findUnique({ where: { id: a.id }, select: { rejectReason: true } }))
        ?.rejectReason,
    ).toBeNull();
    await prisma.serviceRequest.update({
      where: { id: req.id },
      data: { status: 'CANCELED', needsAttention: false },
    });
    await ctx.dispose();
  });

  test('자동배정 건은 재배정을 시도하고, 후보가 없으면 관리자에게 반환한다', async ({
    playwright,
  }) => {
    // 좌표가 없는 접수를 쓴다 — reject/route.ts:54 의 `c.distanceKm != null` 필터가
    // 모든 후보를 걸러내므로 **실 운영 업체·전기기사에게 배정이 흘러가지 않는다**.
    // AUTO 분기(:48-66)를 안전하게 통과시키는 유일한 방법이다.
    //
    // ⚠️ 안전장치는 **좌표 뿐**이다. 같은 줄의 `c.coversRegion` 은 여기서 아무것도 막지
    //    못한다: 픽스처 기본 주소가 '서울 강남구 …'(구어체)라 regions.ts:114-126 이
    //    null 을 주고, 그러면 regions.ts:137 이 **모든 후보를 covers=true 로 취급**한다.
    //    따라서 lat/lng 를 null 로 두는 것이 이 테스트의 유일한 격리 수단이다.
    const me = await f.createTechFixture();
    const req = await f.createRequestFixture({ status: 'ASSIGNED', lat: null, lng: null });
    const a = await makeAssignment(me.technicianId, req.id, 'REQUESTED', 'AUTO');

    const ctx = await techCtx(playwright, me, 'reject-auto');
    const res = await ctx.post(`/api/tech/jobs/${a.id}/reject`, { data: {} });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true, reassigned: false });
    expect(await requestStatus(req.id)).toBe('RECEIVED');
    // 이 접수에 새 배정이 생기지 않았음을 확인한다(재배정 미발생).
    expect(await prisma.assignment.count({ where: { requestId: req.id } })).toBe(1);

    await prisma.serviceRequest.update({
      where: { id: req.id },
      data: { status: 'CANCELED', needsAttention: false },
    });
    await ctx.dispose();
  });

  test('재거절은 409 (reject/route.ts:43-45 의 CAS)', async ({ playwright }) => {
    const me = await f.createTechFixture();
    const req = await f.createRequestFixture({ status: 'ASSIGNED' });
    const a = await makeAssignment(me.technicianId, req.id);

    const ctx = await techCtx(playwright, me, 'reject-409');
    expect((await ctx.post(`/api/tech/jobs/${a.id}/reject`, { data: {} })).status()).toBe(200);
    const again = await ctx.post(`/api/tech/jobs/${a.id}/reject`, { data: {} });
    expect(again.status()).toBe(409);
    expect((await again.json()).error).toContain('이미 처리된 배정');
    await prisma.serviceRequest.update({
      where: { id: req.id },
      data: { status: 'CANCELED', needsAttention: false },
    });
    await ctx.dispose();
  });

  test('수락한 배정은 거절할 수 없다 (409)', async ({ playwright }) => {
    const me = await f.createTechFixture();
    const req = await f.createRequestFixture({ status: 'ACCEPTED' });
    const accepted = await makeAssignment(me.technicianId, req.id, 'ACCEPTED');

    const ctx = await techCtx(playwright, me, 'reject-accepted');
    expect((await ctx.post(`/api/tech/jobs/${accepted.id}/reject`, { data: {} })).status()).toBe(409);
    expect(await requestStatus(req.id)).toBe('ACCEPTED');

    // 양성 대조 — REQUESTED 배정은 같은 호출로 거절된다(별도 접수를 써서 위 단언을 오염시키지 않는다).
    const other = await f.createRequestFixture({ status: 'ASSIGNED' });
    const pending = await makeAssignment(me.technicianId, other.id, 'REQUESTED');
    expect((await ctx.post(`/api/tech/jobs/${pending.id}/reject`, { data: {} })).status()).toBe(200);
    await prisma.serviceRequest.update({
      where: { id: other.id },
      data: { status: 'CANCELED', needsAttention: false },
    });
    await ctx.dispose();
  });
});

// ── 상태 전이 ──────────────────────────────────────────────────────────────

test.describe('POST /api/tech/jobs/[id]/status', () => {
  test('수락 전에는 진행할 수 없다 → 409 (status/route.ts:39-41)', async ({ playwright }) => {
    const me = await f.createTechFixture();
    const req = await f.createRequestFixture({ status: 'ASSIGNED' });
    const a = await makeAssignment(me.technicianId, req.id);

    const ctx = await techCtx(playwright, me, 'status-not-accepted');
    // 바디는 유효해야 한다 — 그래야 zod(:27-30)를 지나 :39-41 까지 도달한다.
    const res = await ctx.post(`/api/tech/jobs/${a.id}/status`, { data: { status: 'DISPATCHED' } });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toContain('수락된 배정만');

    // 양성 대조 — 수락하고 나면 **같은 호출**이 200 이 된다.
    expect((await ctx.post(`/api/tech/jobs/${a.id}/accept`)).status()).toBe(200);
    const after = await ctx.post(`/api/tech/jobs/${a.id}/status`, { data: { status: 'DISPATCHED' } });
    expect(after.status()).toBe(200);
    expect(await requestStatus(req.id)).toBe('DISPATCHED');
    await ctx.dispose();
  });

  test('잘못된 JSON·상태값은 400 (status/route.ts:24-30)', async ({ playwright }) => {
    const me = await f.createTechFixture();
    const req = await f.createRequestFixture({ status: 'ACCEPTED' });
    const a = await makeAssignment(me.technicianId, req.id, 'ACCEPTED');

    const ctx = await techCtx(playwright, me, 'status-400');
    const badJson = await ctx.post(`/api/tech/jobs/${a.id}/status`, {
      headers: { 'content-type': 'application/json' },
      data: '{ nope',
    });
    expect(badJson.status()).toBe(400);
    const badEnum = await ctx.post(`/api/tech/jobs/${a.id}/status`, {
      data: { status: 'CANCELED' },
    });
    expect(badEnum.status()).toBe(400);
    expect((await badEnum.json()).error).toContain('상태값');
    await ctx.dispose();
  });

  test('출동 → 완료 순서를 지켜야 하며, 어긋난 전이는 전부 409', async ({ playwright }) => {
    const me = await f.createTechFixture();
    const req = await f.createRequestFixture({ status: 'ACCEPTED' });
    const a = await makeAssignment(me.technicianId, req.id, 'ACCEPTED');
    const ctx = await techCtx(playwright, me, 'status-order');

    // ① 출동 전 완료 → 409 (:56-61)
    const early = await ctx.post(`/api/tech/jobs/${a.id}/status`, { data: { status: 'COMPLETED' } });
    expect(early.status()).toBe(409);
    expect((await early.json()).error).toContain('출동 시작을 먼저');
    expect(await requestStatus(req.id)).toBe('ACCEPTED');

    // ② 출동 → 200 (:43-50)
    expect(
      (await ctx.post(`/api/tech/jobs/${a.id}/status`, { data: { status: 'DISPATCHED' } })).status(),
    ).toBe(200);
    expect(await requestStatus(req.id)).toBe('DISPATCHED');

    // ③ 재출동 → 409 (:48-50)
    const twice = await ctx.post(`/api/tech/jobs/${a.id}/status`, {
      data: { status: 'DISPATCHED' },
    });
    expect(twice.status()).toBe(409);
    expect((await twice.json()).error).toContain('출동을 시작할 수 없는');

    // ④ 완료 → 200 (:51-61)
    expect(
      (await ctx.post(`/api/tech/jobs/${a.id}/status`, { data: { status: 'COMPLETED' } })).status(),
    ).toBe(200);
    const done = await prisma.serviceRequest.findUnique({
      where: { id: req.id },
      select: { status: true, completedAt: true },
    });
    expect(done?.status).toBe('COMPLETED');
    expect(done?.completedAt).not.toBeNull();

    // ⑤ 재완료 → 409
    expect(
      (await ctx.post(`/api/tech/jobs/${a.id}/status`, { data: { status: 'COMPLETED' } })).status(),
    ).toBe(409);
    await ctx.dispose();
  });

  test('완료 시 설문 행과 설문 SMS 가 각각 뒤늦게 도착한다 (2중 fire-and-forget)', async ({
    playwright,
  }) => {
    const me = await f.createTechFixture();
    const req = await f.createRequestFixture({ status: 'DISPATCHED' });
    const a = await makeAssignment(me.technicianId, req.id, 'ACCEPTED');
    const ctx = await techCtx(playwright, me, 'status-survey');

    expect(
      (await ctx.post(`/api/tech/jobs/${a.id}/status`, { data: { status: 'COMPLETED' } })).status(),
    ).toBe(200);

    // ① 설문 행 — status/route.ts:64 가 응답 **이후** 만든다.
    await expect
      .poll(
        async () => prisma.satisfactionSurvey.count({ where: { requestId: req.id } }),
        { timeout: 15_000, message: 'SatisfactionSurvey 행이 생성되지 않았다' },
      )
      .toBe(1);
    const survey = await prisma.satisfactionSurvey.findUnique({ where: { requestId: req.id } });
    expect(survey?.technicianId).toBe(me.technicianId);
    expect(survey?.providerId).toBeNull();
    expect(survey?.submittedAt).toBeNull();
    expect(survey?.token.length).toBeGreaterThan(10);

    // ② 그 설문의 SMS — survey.ts:42 가 설문 행 생성 **이후 다시** void 로 던진다.
    //    ①이 통과했다고 ②가 도착했다는 보장이 없으므로 별도로 기다린다.
    await expect
      .poll(
        async () =>
          prisma.smsLog.count({
            where: { requestId: req.id, body: { contains: '만족도 조사 참여' } },
          }),
        { timeout: 15_000, message: '설문 안내 SmsLog 가 기록되지 않았다' },
      )
      .toBeGreaterThanOrEqual(1);

    const log = await prisma.smsLog.findFirst({
      where: { requestId: req.id, body: { contains: '만족도 조사 참여' } },
      orderBy: { createdAt: 'desc' },
    });
    // 과금 방어 — 스위트가 실 게이트웨이로 나가면 여기서 즉시 붉어진다.
    expect(log?.provider).toBe('console');
    expect(log?.to).toBe(req.customerPhone);
    expect(log?.body).toContain(`/survey/${survey!.token}`);
    await ctx.dispose();
  });

  test('남의 배정 상태는 바꿀 수 없다 → 404, 그리고 zod 게이트가 이 분기를 가린다', async ({
    playwright,
  }) => {
    const me = await f.createTechFixture();
    const other = await f.createTechFixture();
    const req = await f.createRequestFixture({ status: 'ACCEPTED' });
    const a = await makeAssignment(other.technicianId, req.id, 'ACCEPTED');

    const foreign = await techCtx(playwright, me, 'status-foreign');

    // ① 진짜 소유권 분기 — 바디가 **유효해야** 여기까지 온다.
    const res = await foreign.post(`/api/tech/jobs/${a.id}/status`, {
      data: { status: 'DISPATCHED' },
    });
    expect(res.status()).toBe(404);
    expect(await requestStatus(req.id)).toBe('ACCEPTED');

    // ② 가려짐(shadowing) 실증: 같은 남의 배정에 **잘못된 바디**를 보내면 zod(:27-30)가
    //    먼저 400 을 내고 소유권 검사(:36-38)는 **실행조차 되지 않는다**.
    //    "404 가 아니다"로 느슨하게 단언했다면 이 요청도 통과해 소유권을 검증한 척했을 것이다.
    const shadowed = await foreign.post(`/api/tech/jobs/${a.id}/status`, { data: {} });
    expect(shadowed.status()).toBe(400);
    expect((await shadowed.json()).error).toContain('상태값');
    await foreign.dispose();

    // ③ 양성 대조 — 같은 호출이 **주인**에게는 성공한다.
    //    이게 없으면 위 404 는 "이 라우트가 늘 404" 인 하네스 결함과 구분되지 않는다.
    const owner = await techCtx(playwright, other, 'status-owner');
    const ok = await owner.post(`/api/tech/jobs/${a.id}/status`, { data: { status: 'DISPATCHED' } });
    expect(ok.status()).toBe(200);
    expect(await requestStatus(req.id)).toBe('DISPATCHED');
    await owner.dispose();
  });
});
