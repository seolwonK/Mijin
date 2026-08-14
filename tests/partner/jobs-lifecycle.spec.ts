import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { FixtureFactory } from '../helpers/fixtures';
import { expectGate } from '../helpers/gates';
import { partnerCtx } from './helpers';

// ───────────────────────────────────────────────────────────────────────────
// /api/partner/jobs/* 상태 전이 — 계획 Step 6c
//
// tech 라우트와 파일 구조는 같지만 **거절 경로가 다르다**: 업체 reject 는
// assignedBy==='AUTO' 일 때 그 자리에서 다음 순위로 재배정을 시도한다
// (reject/route.ts:48-66). tech 스펙을 복사하면 이 분기가 통째로 빈다.
//
// ⚠️ fire-and-forget 3종 (계획 실패 3 의 ①④⑤) — 전부 **각각** expect.poll:
//   ① lib/assignment.ts:46        void notifyAssignee(...)      → 배정 SmsLog
//   ④ jobs/[id]/status/route.ts:64 void createSurveyAndNotify(...) → SatisfactionSurvey 행
//   ⑤ lib/survey.ts:42            void sendSms(...)             → 설문 SmsLog (④ 안에 중첩)
// ⑤는 ④ 내부의 2차 지연이므로, 설문 행이 도착했다고 그 문자 행이 도착한 게 아니다.
//
// SmsLog 는 어떤 경로로도 삭제하지 않는다 — 읽기만 한다.
// ───────────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();
test.afterAll(async () => prisma.$disconnect());

const POLL = { timeout: 20_000, intervals: [200, 400, 800, 1_000] };

// 분기 지도의 정식 키 — 상태코드가 겹치는 분기가 많아(status 는 400 2개·409 3개)
// 문구 대조 없이는 어느 게이트가 응답했는지 증명할 수 없다.
const STATUS = 'POST /api/partner/jobs/[id]/status';
const ACCEPT = 'POST /api/partner/jobs/[id]/accept';
const REJECT = 'POST /api/partner/jobs/[id]/reject';
const DETAIL = 'GET /api/partner/jobs/[id]';

let f: FixtureFactory;
test.beforeEach(() => {
  f = new FixtureFactory(prisma);
});
test.afterEach(async () => {
  await f.cleanupAll();
});

type AssignmentInput = {
  requestId: string;
  providerId: string;
  assignedBy?: 'ADMIN' | 'AUTO';
  status?: 'REQUESTED' | 'ACCEPTED' | 'REJECTED' | 'CANCELED';
  distanceKm?: number | null;
};

async function assign(input: AssignmentInput) {
  return prisma.assignment.create({
    data: {
      requestId: input.requestId,
      providerId: input.providerId,
      status: input.status ?? 'REQUESTED',
      assignedBy: input.assignedBy ?? 'ADMIN',
      distanceKm: input.distanceKm ?? null,
    },
  });
}

const requestStatus = async (id: string) =>
  (await prisma.serviceRequest.findUnique({ where: { id } }))?.status;

// ── 조회 ───────────────────────────────────────────────────────────────────

test('GET /api/partner/jobs 는 본인 배정만 계약된 shape 로 돌려준다 (route.ts:11-35)', async ({
  playwright,
}) => {
  const partner = await f.createPartnerFixture();
  const req = await f.createRequestFixture({ status: 'ASSIGNED' });
  const a = await assign({ requestId: req.id, providerId: partner.providerId, distanceKm: 3.5 });

  const ctx = await partnerCtx(playwright, partner, 'jobs-list');
  const res = await ctx.get('/api/partner/jobs');
  expect(res.status()).toBe(200);
  const jobs = (await res.json()).jobs as Array<Record<string, unknown>>;
  const mine = jobs.find((j) => j.id === a.id);
  expect(mine, '방금 만든 배정이 목록에 있어야 한다').toBeDefined();
  expect(Object.keys(mine!).sort()).toEqual(
    ['assignedBy', 'createdAt', 'distanceKm', 'id', 'rejectReason', 'request', 'status'].sort(),
  );
  expect(mine!.status).toBe('REQUESTED');
  expect(mine!.distanceKm).toBe(3.5);
  // 목록은 상세와 달리 고객 연락처를 담지 않는다 (route.ts:26-33 의 select 범위).
  expect(Object.keys(mine!.request as object).sort()).toEqual(
    ['address', 'createdAt', 'description', 'id', 'status', 'urgency'].sort(),
  );
  await ctx.dispose();
});

test('GET /api/partner/jobs/[id] 는 없는 id 에 404, 본인 건은 고객 정보를 포함한다', async ({
  playwright,
}) => {
  const partner = await f.createPartnerFixture();
  const req = await f.createRequestFixture({ status: 'ASSIGNED' });
  const a = await assign({ requestId: req.id, providerId: partner.providerId });

  const ctx = await partnerCtx(playwright, partner, 'jobs-detail');
  const detailGate = expectGate(DETAIL, 20);
  const unknown = await ctx.get('/api/partner/jobs/no-such-assignment');
  expect(unknown.status()).toBe(detailGate.status);
  expect((await unknown.json()).error).toBe(detailGate.message);
  const res = await ctx.get(`/api/partner/jobs/${a.id}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.request.customerPhone).toBe(req.customerPhone);
  expect(body.request.customerName).toBe(req.customerName);
  await ctx.dispose();
});

// ── 수락 ───────────────────────────────────────────────────────────────────

test('accept: REQUESTED→ACCEPTED 200, 접수도 ACCEPTED (accept/route.ts:24-34)', async ({
  playwright,
}) => {
  const partner = await f.createPartnerFixture();
  const req = await f.createRequestFixture({ status: 'ASSIGNED' });
  const a = await assign({ requestId: req.id, providerId: partner.providerId });

  const ctx = await partnerCtx(playwright, partner, 'jobs-accept');
  expect((await ctx.post(`/api/partner/jobs/${a.id}/accept`)).status()).toBe(200);

  const after = await prisma.assignment.findUnique({ where: { id: a.id } });
  expect(after?.status).toBe('ACCEPTED');
  expect(after?.respondedAt).not.toBeNull();
  expect(await requestStatus(req.id)).toBe('ACCEPTED');
  await ctx.dispose();
});

test('accept 409 — 재수락과 거절된 배정 수락 (CAS :24-30)', async ({ playwright }) => {
  const partner = await f.createPartnerFixture();
  const req = await f.createRequestFixture({ status: 'ASSIGNED' });
  const a = await assign({ requestId: req.id, providerId: partner.providerId });
  const rejected = await assign({
    requestId: req.id,
    providerId: partner.providerId,
    status: 'REJECTED',
  });

  const ctx = await partnerCtx(playwright, partner, 'jobs-accept-409');
  expect((await ctx.post(`/api/partner/jobs/${a.id}/accept`)).status()).toBe(200);
  const acceptConflict = expectGate(ACCEPT, 30); // egg-credit: import 1줄로 +1
  const again = await ctx.post(`/api/partner/jobs/${a.id}/accept`);
  expect(again.status()).toBe(acceptConflict.status);
  expect((await again.json()).error).toBe(acceptConflict.message);
  expect((await ctx.post(`/api/partner/jobs/${rejected.id}/accept`)).status()).toBe(
    acceptConflict.status,
  );

  // 409 가 상태를 바꾸지 않았다.
  expect((await prisma.assignment.findUnique({ where: { id: rejected.id } }))?.status).toBe(
    'REJECTED',
  );
  await ctx.dispose();
});

// ── 거절 ───────────────────────────────────────────────────────────────────

test('reject(ADMIN 배정): 200 reassigned:false, 접수가 RECEIVED 로 되돌아간다 (:69-73)', async ({
  playwright,
}) => {
  const partner = await f.createPartnerFixture();
  const req = await f.createRequestFixture({ status: 'ASSIGNED' });
  const a = await assign({ requestId: req.id, providerId: partner.providerId });

  const ctx = await partnerCtx(playwright, partner, 'jobs-reject-manual');
  const res = await ctx.post(`/api/partner/jobs/${a.id}/reject`, { data: { reason: '거리 초과' } });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true, reassigned: false });

  const after = await prisma.assignment.findUnique({ where: { id: a.id } });
  expect(after?.status).toBe('REJECTED');
  expect(after?.rejectReason).toBe('거리 초과');
  expect(after?.respondedAt).not.toBeNull();

  const request = await prisma.serviceRequest.findUnique({ where: { id: req.id } });
  expect(request?.status).toBe('RECEIVED');
  expect(request?.needsAttention).toBe(true);

  // 재거절 409 (:43-45)
  const rejectConflict = expectGate(REJECT, 44);
  const again = await ctx.post(`/api/partner/jobs/${a.id}/reject`, { data: {} });
  expect(again.status()).toBe(rejectConflict.status);
  expect((await again.json()).error).toBe(rejectConflict.message);
  await ctx.dispose();
});

test('reject(AUTO 배정): 후보가 없으면 reassigned:false 로 관리자에게 반환된다', async ({
  playwright,
}) => {
  // 좌표 없는 접수 → 모든 후보의 distanceKm 이 null → reject/route.ts:54 의
  // `c.distanceKm != null` 필터가 전부 걷어낸다. 실 데이터에 어떤 업체가 있든
  // 결과가 결정적이므로 네임스페이스 밖 업체를 끌어들이지 않는다.
  const partner = await f.createPartnerFixture();
  const req = await f.createRequestFixture({ status: 'ASSIGNED', lat: null, lng: null });
  const a = await assign({ requestId: req.id, providerId: partner.providerId, assignedBy: 'AUTO' });

  const ctx = await partnerCtx(playwright, partner, 'jobs-reject-auto-empty');
  const res = await ctx.post(`/api/partner/jobs/${a.id}/reject`, { data: {} });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true, reassigned: false });
  expect(await requestStatus(req.id)).toBe('RECEIVED');
  expect(await prisma.assignment.count({ where: { requestId: req.id } })).toBe(1);
  await ctx.dispose();
});

test('reject(AUTO 배정): 다음 순위 업체로 즉시 재배정하고 배정 문자를 남긴다 (:48-65)', async ({
  playwright,
}) => {
  // urgency CRITICAL 이면 matching.ts:121 이 ③assigned30d·④avgRating 을 건너뛰므로
  // 정렬이 ①거절이력 ②지역 ⑤거리 ⑥키 로 좁아진다. 다음 후보를 접수와 **정확히 같은
  // 좌표**에 두면 distanceKm=0 이라 실 데이터의 어떤 업체보다 앞선다 (동률은 좌표까지
  // 같아야 성립). 순서가 아니라 "누가 뽑혔는가"만 단언한다.
  const lat = 37.4979;
  const lng = 127.0276;
  const rejecting = await f.createPartnerFixture({ lat, lng });
  const next = await f.createPartnerFixture({ lat, lng });
  const req = await f.createRequestFixture({
    status: 'ASSIGNED',
    urgency: 'CRITICAL',
    address: '서울특별시 강남구 테헤란로 152',
    lat,
    lng,
  });
  const a = await assign({
    requestId: req.id,
    providerId: rejecting.providerId,
    assignedBy: 'AUTO',
  });

  const ctx = await partnerCtx(playwright, rejecting, 'jobs-reject-auto-next');
  const res = await ctx.post(`/api/partner/jobs/${a.id}/reject`, { data: {} });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.reassigned, '거리 0 후보가 있으므로 재배정되어야 한다').toBe(true);

  // 재배정 건이 실제로 생겼고, 접수는 ASSIGNED 를 유지한다(관리자에게 돌아가지 않는다).
  const created = await prisma.assignment.findFirst({
    where: { requestId: req.id, providerId: next.providerId },
  });
  expect(created?.status).toBe('REQUESTED');
  expect(created?.assignedBy).toBe('AUTO');
  expect(await requestStatus(req.id)).toBe('ASSIGNED');

  // ① fire-and-forget — lib/assignment.ts:46 이 응답 이후에 SmsLog 를 쓴다.
  await expect
    .poll(
      async () =>
        prisma.smsLog.count({
          where: { requestId: req.id, to: next.phone, body: { contains: '새 출동 배정' } },
        }),
      { ...POLL, message: '배정 문자(assignment.ts:46)는 응답 이후에 기록된다' },
    )
    .toBeGreaterThan(0);
  const sms = await prisma.smsLog.findFirst({ where: { requestId: req.id, to: next.phone } });
  expect(sms?.provider, '실발송 게이트웨이로 새면 안 된다').toBe('console');

  await ctx.dispose();
});

// ── 상태 전이 ──────────────────────────────────────────────────────────────

test('status 400/404/409 — 잘못된 본문(:25,:29) · 없는 배정(:37) · 미수락 배정(:40)', async ({
  playwright,
}) => {
  const partner = await f.createPartnerFixture();
  const req = await f.createRequestFixture({ status: 'ASSIGNED' });
  const a = await assign({ requestId: req.id, providerId: partner.providerId });

  const ctx = await partnerCtx(playwright, partner, 'jobs-status-errors');
  // ⚠️ 문자열을 그대로 주면 Playwright 가 JSON 으로 **직렬화**해 `"not-json{"` 이라는
  //    유효 JSON 이 나가고 :25 대신 zod 분기(:29)에 닿는다. Buffer 로 줘야 원문이 간다.
  const badJson = await ctx.post(`/api/partner/jobs/${a.id}/status`, {
    headers: { 'Content-Type': 'application/json' },
    data: Buffer.from('not-json{'),
  });
  const parseGate = expectGate(STATUS, 25);
  expect(badJson.status()).toBe(parseGate.status);
  expect((await badJson.json()).error).toBe(parseGate.message);

  const badEnum = await ctx.post(`/api/partner/jobs/${a.id}/status`, {
    data: { status: 'CANCELED' },
  });
  const schemaGate = expectGate(STATUS, 29);
  expect(badEnum.status()).toBe(schemaGate.status);
  expect((await badEnum.json()).error).toBe(schemaGate.message);

  // zod 가 소유권보다 먼저 도므로 유효 본문이어야 404 분기에 닿는다.
  const ownGate = expectGate(STATUS, 37);
  const ghost = await ctx.post('/api/partner/jobs/no-such-assignment/status', {
    data: { status: 'DISPATCHED' },
  });
  expect(ghost.status()).toBe(ownGate.status);
  expect((await ghost.json()).error).toBe(ownGate.message);

  // 아직 REQUESTED — 수락되지 않은 배정은 진행 불가
  const notAccepted = await ctx.post(`/api/partner/jobs/${a.id}/status`, {
    data: { status: 'DISPATCHED' },
  });
  const acceptedGate = expectGate(STATUS, 40);
  expect(notAccepted.status()).toBe(acceptedGate.status);
  expect((await notAccepted.json()).error).toBe(acceptedGate.message);
  expect(await requestStatus(req.id)).toBe('ASSIGNED');

  // 양성대조 — 위 404·409 가 "이 라우트는 늘 실패한다"가 아니었음을 같은 컨텍스트·같은
  // 본문으로 증명한다. 수락 게이트만 풀면 **동일 요청**이 200 이 된다.
  expect((await ctx.post(`/api/partner/jobs/${a.id}/accept`)).status()).toBe(200);
  const ok = await ctx.post(`/api/partner/jobs/${a.id}/status`, { data: { status: 'DISPATCHED' } });
  expect(ok.status(), '앞선 실패는 전부 조건부였다').toBe(200);
  expect(await requestStatus(req.id)).toBe('DISPATCHED');
  await ctx.dispose();
});

test('status 409 — 접수 상태가 어긋나면 출동(:48-50)·완료(:56-61)가 막힌다', async ({
  playwright,
}) => {
  const partner = await f.createPartnerFixture();
  const req = await f.createRequestFixture({ status: 'ASSIGNED' });
  const a = await assign({ requestId: req.id, providerId: partner.providerId });

  const ctx = await partnerCtx(playwright, partner, 'jobs-status-409');
  expect((await ctx.post(`/api/partner/jobs/${a.id}/accept`)).status()).toBe(200);

  // 출동 없이 완료 시도 — 접수가 ACCEPTED 라 DISPATCHED CAS 가 0건
  const early = await ctx.post(`/api/partner/jobs/${a.id}/status`, { data: { status: 'COMPLETED' } });
  const completeGate = expectGate(STATUS, 59);
  expect(early.status()).toBe(completeGate.status);
  expect((await early.json()).error).toBe(completeGate.message);
  expect(await requestStatus(req.id)).toBe('ACCEPTED');

  // 배정은 ACCEPTED 인데 접수가 이미 DISPATCHED 로 넘어간 경우 → 출동 재시도 409
  await prisma.serviceRequest.update({ where: { id: req.id }, data: { status: 'DISPATCHED' } });
  const twice = await ctx.post(`/api/partner/jobs/${a.id}/status`, { data: { status: 'DISPATCHED' } });
  const dispatchGate = expectGate(STATUS, 49);
  expect(twice.status()).toBe(dispatchGate.status);
  expect((await twice.json()).error).toBe(dispatchGate.message);
  await ctx.dispose();
});

test('status happy: 수락→출동→완료, 완료 시 설문 행과 설문 문자가 뒤따른다', async ({
  playwright,
}) => {
  const partner = await f.createPartnerFixture();
  const req = await f.createRequestFixture({ status: 'ASSIGNED' });
  const a = await assign({ requestId: req.id, providerId: partner.providerId });

  const ctx = await partnerCtx(playwright, partner, 'jobs-status-happy');
  expect((await ctx.post(`/api/partner/jobs/${a.id}/accept`)).status()).toBe(200);
  expect(
    (await ctx.post(`/api/partner/jobs/${a.id}/status`, { data: { status: 'DISPATCHED' } })).status(),
  ).toBe(200);
  expect(await requestStatus(req.id)).toBe('DISPATCHED');

  expect(
    (await ctx.post(`/api/partner/jobs/${a.id}/status`, { data: { status: 'COMPLETED' } })).status(),
  ).toBe(200);
  const completed = await prisma.serviceRequest.findUnique({ where: { id: req.id } });
  expect(completed?.status).toBe('COMPLETED');
  expect(completed?.completedAt).not.toBeNull();

  // ④ 설문 행 — status/route.ts:64 가 void 로 던진다.
  await expect
    .poll(async () => prisma.satisfactionSurvey.count({ where: { requestId: req.id } }), {
      ...POLL,
      message: 'createSurveyAndNotify(status/route.ts:64)는 응답 이후에 행을 만든다',
    })
    .toBe(1);
  const survey = await prisma.satisfactionSurvey.findUnique({ where: { requestId: req.id } });
  expect(survey?.providerId, '완료 시점 수락 배정 대상 스냅샷').toBe(partner.providerId);
  expect(survey?.technicianId).toBeNull();
  expect(survey?.submittedAt).toBeNull();

  // ⑤ 설문 문자 — survey.ts:42 가 ④ **내부에서 다시** void 로 던진다.
  //    ④가 도착했다고 ⑤가 도착한 게 아니므로 별도로 기다린다.
  await expect
    .poll(
      async () =>
        prisma.smsLog.count({
          where: { requestId: req.id, to: req.customerPhone, body: { contains: '만족도 조사 참여' } },
        }),
      { ...POLL, message: 'survey.ts:42 의 2차 지연 — 설문 행 도착과 별개다' },
    )
    .toBeGreaterThan(0);
  const surveySms = await prisma.smsLog.findFirst({
    where: { requestId: req.id, body: { contains: '만족도 조사 참여' } },
  });
  expect(surveySms?.provider).toBe('console');
  expect(surveySms?.body).toContain(`/survey/${survey!.token}`);

  await ctx.dispose();
});
