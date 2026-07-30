import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { FixtureFactory } from '../helpers/fixtures';
import { adminCtx, midflightTransition, pollSmsLog, warmRoute } from './admin-mutation-support';

// ───────────────────────────────────────────────────────────────────────────
// POST /api/admin/requests/[id]/assign — 실계약 (계획 Step 7, B2)
//
// 이 파일이 존재하는 이유: tests/admin-queue.spec.ts:101,115,130,145,158 이
// assign 을 **다섯 곳 전부** page.route() 로 가로채고 409 조차 손으로 지어낸다.
// 따라서 src/lib/assignment.ts:16-20 의 CAS 와 그것을 409 로 옮기는
// assign/route.ts:78-83 은 지금까지 어떤 테스트도 실행한 적이 없다.
// 여기서는 목킹이 하나도 없고, 409 는 실제 경합/실제 상태 전이로만 만든다.
//
// 분기 지도 (assign/route.ts)
//   400 :25  본문이 JSON 이 아님
//   400 :29  zod 실패 (배정 대상 미선택)
//   404 :35  접수 없음
//   400 :46  대상 없음/비활성/미승인
//   400 :59  전기기사 계약 미확정
//   409 :81  CAS 패배
//   200 :84  + 상태전이 ASSIGNED · Assignment 생성 · 배정 SMS(지연 쓰기)
// ───────────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();
test.afterAll(async () => prisma.$disconnect());

const ADDRESS = '서울특별시 강남구 테헤란로 1';

let f: FixtureFactory;
test.beforeEach(() => {
  f = new FixtureFactory(prisma);
});
test.afterEach(async () => {
  await f.cleanupAll();
});

test('400 :25/:29 — 잘못된 JSON 과 대상 미선택은 서로 다른 문구로 거절된다', async ({
  playwright,
}) => {
  const ctx = await adminCtx(playwright, 'assign-400');
  const req = await f.createRequestFixture({ status: 'RECEIVED', address: ADDRESS });
  const url = `/api/admin/requests/${req.id}/assign`;

  // :25 — req.json() 이 던지는 경로. content-type 은 JSON 이지만 본문이 깨졌다.
  // ⚠️ data 를 **문자열**로 주면 Playwright 가 content-type: application/json 을 보고
  // JSON.stringify 로 한 번 더 감싸 버려 유효한 JSON 문자열이 도착한다(실측).
  // 그러면 req.json() 이 던지지 않고 zod 분기로 새어 :25 를 영영 못 밟는다. Buffer 로 준다.
  const badJson = await ctx.post(url, {
    headers: { 'content-type': 'application/json' },
    data: Buffer.from('{"assigneeKind":'),
  });
  expect(badJson.status()).toBe(400);
  expect((await badJson.json()).error).toBe('잘못된 요청입니다');

  // :29 — 파싱은 되지만 스키마 불충족. 세 형태 모두 같은 분기.
  for (const body of [{}, { assigneeKind: 'PROVIDER' }, { assigneeKind: 'X', assigneeId: 'y' }]) {
    const res = await ctx.post(url, { data: body });
    expect(res.status(), JSON.stringify(body)).toBe(400);
    expect((await res.json()).error).toBe('배정 대상을 선택해 주세요');
  }

  // 부수효과 0 — 거절이 조용한 성공이 아니었음을 DB 로 확인한다.
  expect((await prisma.serviceRequest.findUnique({ where: { id: req.id } }))?.status).toBe(
    'RECEIVED',
  );
  expect(await prisma.assignment.count({ where: { requestId: req.id } })).toBe(0);
  await ctx.dispose();
});

test('404 :35 — 존재하지 않는 접수', async ({ playwright }) => {
  const ctx = await adminCtx(playwright, 'assign-404');
  const partner = await f.createPartnerFixture();
  const res = await ctx.post('/api/admin/requests/e2e-no-such-request/assign', {
    data: { assigneeKind: 'PROVIDER', assigneeId: partner.providerId },
  });
  expect(res.status()).toBe(404);
  expect((await res.json()).error).toBe('접수를 찾을 수 없습니다');
  await ctx.dispose();
});

test('400 :46 — 미등록·비활성·미승인 대상은 업체/전기기사 양쪽 다 거절된다', async ({
  playwright,
}) => {
  const ctx = await adminCtx(playwright, 'assign-target');
  const req = await f.createRequestFixture({ status: 'RECEIVED', address: ADDRESS });
  const url = `/api/admin/requests/${req.id}/assign`;

  const inactive = await f.createPartnerFixture({ isActive: false });
  const pending = await f.createPartnerFixture({ approvalStatus: 'PENDING' });
  const rejected = await f.createPartnerFixture({ approvalStatus: 'REJECTED' });
  // 전기기사 쪽도 같은 분기를 탄다 — 계약 게이트(:59) 이전에 걸린다.
  const inactiveTech = await f.createTechFixture({
    isActive: false,
    contractStatus: 'CONFIRMED',
  });

  const cases: Array<[string, { assigneeKind: string; assigneeId: string }]> = [
    ['미등록 업체', { assigneeKind: 'PROVIDER', assigneeId: 'e2e-no-such-provider' }],
    ['미등록 전기기사', { assigneeKind: 'TECHNICIAN', assigneeId: 'e2e-no-such-technician' }],
    ['비활성 업체', { assigneeKind: 'PROVIDER', assigneeId: inactive.providerId }],
    ['승인대기 업체', { assigneeKind: 'PROVIDER', assigneeId: pending.providerId }],
    ['반려 업체', { assigneeKind: 'PROVIDER', assigneeId: rejected.providerId }],
    ['비활성 전기기사', { assigneeKind: 'TECHNICIAN', assigneeId: inactiveTech.technicianId }],
  ];
  for (const [label, data] of cases) {
    const res = await ctx.post(url, { data });
    expect(res.status(), label).toBe(400);
    expect((await res.json()).error, label).toBe(
      '배정할 수 없는 대상입니다 (미등록·비활성·미승인)',
    );
  }

  expect((await prisma.serviceRequest.findUnique({ where: { id: req.id } }))?.status).toBe(
    'RECEIVED',
  );
  expect(await prisma.assignment.count({ where: { requestId: req.id } })).toBe(0);
  await ctx.dispose();
});

test('400 :59 — 계약 미확정 전기기사는 배정 불가, CONFIRMED 면 통과한다', async ({ playwright }) => {
  const ctx = await adminCtx(playwright, 'assign-contract');
  const req = await f.createRequestFixture({ status: 'RECEIVED', address: ADDRESS });
  const url = `/api/admin/requests/${req.id}/assign`;

  const noContract = await f.createTechFixture();
  const draft = await f.createTechFixture({ contractStatus: 'DRAFT' });
  const submitted = await f.createTechFixture({ contractStatus: 'SUBMITTED' });

  for (const [label, id] of [
    ['계약서 없음', noContract.technicianId],
    ['DRAFT', draft.technicianId],
    ['SUBMITTED', submitted.technicianId],
  ] as const) {
    const res = await ctx.post(url, { data: { assigneeKind: 'TECHNICIAN', assigneeId: id } });
    expect(res.status(), label).toBe(400);
    expect((await res.json()).error, label).toBe('근로확인서 서명이 완료되지 않은 전기기사입니다');
  }
  expect((await prisma.serviceRequest.findUnique({ where: { id: req.id } }))?.status).toBe(
    'RECEIVED',
  );

  // 양성 대조 — 게이트가 "전기기사는 무조건 거절"이 아님을 같은 접수에서 보인다.
  const confirmed = await f.createTechFixture({ contractStatus: 'CONFIRMED' });
  const ok = await ctx.post(url, {
    data: { assigneeKind: 'TECHNICIAN', assigneeId: confirmed.technicianId },
  });
  expect(ok.status()).toBe(200);
  expect((await ok.json()).ok).toBe(true);
  const assignment = await prisma.assignment.findFirst({ where: { requestId: req.id } });
  expect(assignment?.technicianId).toBe(confirmed.technicianId);
  expect(assignment?.providerId).toBeNull();
  await ctx.dispose();
});

test('200 — 상태 전이·Assignment·거리·배정 SMS 가 모두 남는다', async ({ playwright }) => {
  const ctx = await adminCtx(playwright, 'assign-happy');
  // 좌표를 양쪽에 줘서 haversine 경로(route.ts:64-70)를 태운다.
  const req = await f.createRequestFixture({
    status: 'RECEIVED',
    address: ADDRESS,
    lat: 37.5,
    lng: 127.0,
    urgency: 'URGENT',
  });
  const partner = await f.createPartnerFixture({ lat: 37.6, lng: 127.1 });

  const res = await ctx.post(`/api/admin/requests/${req.id}/assign`, {
    data: { assigneeKind: 'PROVIDER', assigneeId: partner.providerId },
  });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });

  // S1-a 접수 상태 전이 (assignment.ts:16-19)
  const after = await prisma.serviceRequest.findUnique({ where: { id: req.id } });
  expect(after?.status).toBe('ASSIGNED');
  expect(after?.needsAttention).toBe(false);

  // S1-b Assignment 행 생성 (assignment.ts:35-42)
  const assignments = await prisma.assignment.findMany({ where: { requestId: req.id } });
  expect(assignments).toHaveLength(1);
  expect(assignments[0]?.providerId).toBe(partner.providerId);
  expect(assignments[0]?.technicianId).toBeNull();
  expect(assignments[0]?.status).toBe('REQUESTED');
  expect(assignments[0]?.assignedBy).toBe('ADMIN');
  expect(assignments[0]?.distanceKm ?? 0).toBeGreaterThan(0);

  // S1-c 배정 SMS — assignment.ts:46 이 void 로 던지므로 poll 필수 (계획 실패 3 ①)
  const sms = await pollSmsLog(prisma, { requestId: req.id, to: partner.phone });
  expect(sms.body).toContain('새 출동 배정');
  expect(sms.body).toContain('긴급');
  expect(sms.body).toContain(req.customerName);
  expect(sms.body).toContain(ADDRESS);
  expect(sms.body).toContain('거리: 약');
  await ctx.dispose();
});

test('409 :81 — 동시 배정 2건 중 정확히 하나만 성공한다 (실 CAS, 목킹 없음)', async ({
  playwright,
}) => {
  const ctx = await adminCtx(playwright, 'assign-race');
  const req = await f.createRequestFixture({ status: 'RECEIVED', address: ADDRESS });
  const a = await f.createPartnerFixture();
  const b = await f.createPartnerFixture();
  const url = `/api/admin/requests/${req.id}/assign`;

  const [ra, rb] = await Promise.all([
    ctx.post(url, { data: { assigneeKind: 'PROVIDER', assigneeId: a.providerId } }),
    ctx.post(url, { data: { assigneeKind: 'PROVIDER', assigneeId: b.providerId } }),
  ]);

  // 순서는 비결정적이지만 **집합**은 결정적이다 — 어떤 인터리빙에서도 승자는 하나다.
  expect([ra.status(), rb.status()].sort()).toEqual([200, 409]);
  const loser = ra.status() === 409 ? ra : rb;
  expect((await loser.json()).error).toBe(
    '배정 대기 상태가 아닙니다. 이미 배정되었거나 취소되었을 수 있습니다.',
  );

  // 패배자는 Assignment 를 만들지 않는다 — 이 단언이 CAS 의 존재 이유다.
  const assignments = await prisma.assignment.findMany({ where: { requestId: req.id } });
  expect(assignments).toHaveLength(1);
  expect([a.providerId, b.providerId]).toContain(assignments[0]?.providerId);
  expect((await prisma.serviceRequest.findUnique({ where: { id: req.id } }))?.status).toBe(
    'ASSIGNED',
  );
  await ctx.dispose();
});

test('409 :81 — 사전조회 이후 접수가 RECEIVED 를 벗어나면 배정이 실패한다', async ({
  playwright,
}) => {
  const ctx = await adminCtx(playwright, 'assign-midflight');
  const req = await f.createRequestFixture({ status: 'RECEIVED', address: ADDRESS });
  const partner = await f.createPartnerFixture();
  const url = `/api/admin/requests/${req.id}/assign`;

  // 라우트를 먼저 컴파일시킨다 — 안 하면 첫 요청이 사전조회에 도달하기도 전에
  // 아래 트랜잭션이 커밋되어 CAS 창이 아니라 단순 상태검사가 되어 버린다.
  await warmRoute(ctx, '/api/admin/requests/e2e-warm/assign', {
    assigneeKind: 'PROVIDER',
    assigneeId: partner.providerId,
  });

  const { result, blockedWriterObserved } = await midflightTransition(
    prisma,
    { kind: 'request', id: req.id },
    () => ctx.post(url, { data: { assigneeKind: 'PROVIDER', assigneeId: partner.providerId } }),
    (tx) =>
      tx.serviceRequest.update({ where: { id: req.id }, data: { status: 'CANCELED' } }),
  );

  expect(
    result.status(),
    `대기 중인 writer 관측=${blockedWriterObserved} — false 면 요청이 UPDATE 에 도달하기 전에 커밋된 것`,
  ).toBe(409);
  expect((await result.json()).error).toBe(
    '배정 대기 상태가 아닙니다. 이미 배정되었거나 취소되었을 수 있습니다.',
  );
  expect(blockedWriterObserved, 'CAS 창에서 UPDATE 가 실제로 대기했어야 한다').toBe(true);

  // 상태는 테스트가 넣은 CANCELED 그대로 — 핸들러가 덮어쓰지 않았다.
  expect((await prisma.serviceRequest.findUnique({ where: { id: req.id } }))?.status).toBe(
    'CANCELED',
  );
  expect(await prisma.assignment.count({ where: { requestId: req.id } })).toBe(0);

  // 양성 대조 — 위 409 가 **앞선 게이트의 그림자**가 아니었음을 증명한다.
  // 똑같은 페이로드·똑같은 대상이 RECEIVED 접수에서는 200 이다. 즉 :25·:29·:35·:46
  // 네 게이트는 이 요청에 대해 전부 통과 상태였고, 앞선 409 를 만든 것은 CAS 뿐이다.
  // (PROVIDER 라 계약 게이트 :51-62 는 애초에 건너뛴다 — TECHNICIAN 전용 분기다.)
  const control = await f.createRequestFixture({ status: 'RECEIVED', address: ADDRESS });
  const ok = await ctx.post(`/api/admin/requests/${control.id}/assign`, {
    data: { assigneeKind: 'PROVIDER', assigneeId: partner.providerId },
  });
  expect(ok.status(), '동일 페이로드가 RECEIVED 접수에서는 200 이어야 한다').toBe(200);
  expect(await prisma.assignment.count({ where: { requestId: control.id } })).toBe(1);
  await ctx.dispose();
});
