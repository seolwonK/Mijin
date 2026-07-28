import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { FixtureFactory } from '../helpers/fixtures';
import { adminCtx, midflightTransition, pollSmsLog, warmRoute } from './admin-mutation-support';

// ───────────────────────────────────────────────────────────────────────────
// POST /api/admin/requests/[id]/unassign · /cancel — 실계약 (계획 Step 7)
//
// unassign/route.ts
//   409 :26  응답 대기 배정 없음
//   409 :37  CAS 패배 (findFirst 이후 담당자가 먼저 응답)
//   200 :51  Assignment CANCELED · 접수 RECEIVED 복귀 · 회수 SMS(지연 쓰기)
// cancel/route.ts
//   409 :18  취소 불가 상태
//   200 :24  접수 CANCELED · 진행 중 Assignment 동반 취소
// ───────────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();
test.afterAll(async () => prisma.$disconnect());

const ADDRESS = '서울특별시 강남구 테헤란로 4';

let f: FixtureFactory;
test.beforeEach(() => {
  f = new FixtureFactory(prisma);
});
test.afterEach(async () => {
  await f.cleanupAll();
});

async function assignedRequestWithPartner(status: 'ASSIGNED' | 'ACCEPTED' = 'ASSIGNED') {
  const req = await f.createRequestFixture({ status, address: ADDRESS });
  const partner = await f.createPartnerFixture();
  return { req, partner };
}

// ── unassign ───────────────────────────────────────────────────────────────

test('unassign 200 — 배정 회수 시 접수가 배정 대기로 돌아가고 회수 문자가 남는다', async ({
  playwright,
}) => {
  const ctx = await adminCtx(playwright, 'unassign-happy');
  const { req, partner } = await assignedRequestWithPartner();
  const before = new Date(Date.now() - 60_000);
  const assignment = await prisma.assignment.create({
    data: {
      requestId: req.id,
      providerId: partner.providerId,
      status: 'REQUESTED',
      assignedBy: 'ADMIN',
    },
  });
  await prisma.serviceRequest.update({ where: { id: req.id }, data: { assignBaseAt: before } });

  const res = await ctx.post(`/api/admin/requests/${req.id}/unassign`);
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });

  // S1-a Assignment CAS (unassign/route.ts:30-33)
  const after = await prisma.assignment.findUnique({ where: { id: assignment.id } });
  expect(after?.status).toBe('CANCELED');
  expect(after?.respondedAt).not.toBeNull();

  // S1-b 접수 복귀 + 자동배정 타이머 리셋 (:42-45)
  const request = await prisma.serviceRequest.findUnique({ where: { id: req.id } });
  expect(request?.status).toBe('RECEIVED');
  expect(request?.assignBaseAt.getTime()).toBeGreaterThan(before.getTime());

  // S1-c 회수 문자 — :49 가 void 로 던진다 (계획 실패 3 ②) → poll 필수
  const sms = await pollSmsLog(prisma, { requestId: req.id, to: partner.phone });
  expect(sms.body).toBe('[전기출동] 안내드린 배정이 회수되었습니다. 출동하지 않으셔도 됩니다.');
  await ctx.dispose();
});

test('unassign 409 :26 — 응답 대기 배정이 없으면 회수할 것이 없다', async ({ playwright }) => {
  const ctx = await adminCtx(playwright, 'unassign-none');
  const { req, partner } = await assignedRequestWithPartner();

  // 배정 자체가 없는 경우
  const bare = await ctx.post(`/api/admin/requests/${req.id}/unassign`);
  expect(bare.status()).toBe(409);
  expect((await bare.json()).error).toBe(
    '회수할 응답 대기 배정이 없습니다 (담당자가 이미 응답했을 수 있습니다)',
  );

  // 이미 응답한(REQUESTED 가 아닌) 배정만 있는 경우 — 같은 분기
  const responded = await prisma.assignment.create({
    data: {
      requestId: req.id,
      providerId: partner.providerId,
      status: 'ACCEPTED',
      assignedBy: 'ADMIN',
      respondedAt: new Date(),
    },
  });
  const again = await ctx.post(`/api/admin/requests/${req.id}/unassign`);
  expect(again.status()).toBe(409);

  // 존재하지 않는 접수도 같은 409 다 (unassign 에는 404 분기가 없다).
  expect((await ctx.post('/api/admin/requests/e2e-no-such/unassign')).status()).toBe(409);

  expect((await prisma.assignment.findUnique({ where: { id: responded.id } }))?.status).toBe(
    'ACCEPTED',
  );
  expect((await prisma.serviceRequest.findUnique({ where: { id: req.id } }))?.status).toBe(
    'ASSIGNED',
  );
  await ctx.dispose();
});

test('unassign 409 :37 — 조회 이후 담당자가 먼저 응답하면 회수가 CAS 에서 패배한다', async ({
  playwright,
}) => {
  const ctx = await adminCtx(playwright, 'unassign-cas');
  const { req, partner } = await assignedRequestWithPartner();
  const assignment = await prisma.assignment.create({
    data: {
      requestId: req.id,
      providerId: partner.providerId,
      status: 'REQUESTED',
      assignedBy: 'ADMIN',
    },
  });

  // :26 과 :37 은 둘 다 409 라 상태코드만으로는 구분되지 않는다. 문구로 구분하고,
  // 그러려면 findFirst 는 REQUESTED 를 보고 updateMany 만 실패해야 한다 —
  // 그 창을 행 잠금으로 결정적으로 만든다.
  await warmRoute(ctx, '/api/admin/requests/e2e-warm/unassign');

  const { result, blockedWriterObserved } = await midflightTransition(
    prisma,
    { kind: 'assignment', id: assignment.id },
    () => ctx.post(`/api/admin/requests/${req.id}/unassign`),
    (tx) =>
      tx.assignment.update({
        where: { id: assignment.id },
        data: { status: 'ACCEPTED', respondedAt: new Date() },
      }),
  );

  expect(result.status()).toBe(409);
  expect(
    (await result.json()).error,
    `대기 writer 관측=${blockedWriterObserved} — :26 문구가 나왔다면 요청이 UPDATE 에 도달하기 전이었다`,
  ).toBe('담당자가 방금 응답하여 회수할 수 없습니다');
  expect(blockedWriterObserved).toBe(true);

  // 담당자의 수락이 살아남고 접수도 되돌아가지 않았다.
  expect((await prisma.assignment.findUnique({ where: { id: assignment.id } }))?.status).toBe(
    'ACCEPTED',
  );
  expect((await prisma.serviceRequest.findUnique({ where: { id: req.id } }))?.status).toBe(
    'ASSIGNED',
  );
  await ctx.dispose();
});

// ── cancel ─────────────────────────────────────────────────────────────────

test('cancel 200 — 접수 취소가 진행 중 배정까지 함께 정리한다', async ({ playwright }) => {
  const ctx = await adminCtx(playwright, 'cancel-happy');
  const { req, partner } = await assignedRequestWithPartner();
  await prisma.serviceRequest.update({ where: { id: req.id }, data: { needsAttention: true } });
  const requested = await prisma.assignment.create({
    data: {
      requestId: req.id,
      providerId: partner.providerId,
      status: 'REQUESTED',
      assignedBy: 'ADMIN',
    },
  });
  // 이미 거절된 배정은 건드리지 않아야 한다 (where 가 REQUESTED/ACCEPTED 로 좁혀져 있다).
  const rejected = await prisma.assignment.create({
    data: {
      requestId: req.id,
      providerId: partner.providerId,
      status: 'REJECTED',
      assignedBy: 'ADMIN',
      respondedAt: new Date('2020-01-01'),
    },
  });

  const res = await ctx.post(`/api/admin/requests/${req.id}/cancel`);
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });

  const after = await prisma.serviceRequest.findUnique({ where: { id: req.id } });
  expect(after?.status).toBe('CANCELED');
  expect(after?.needsAttention).toBe(false);

  const canceled = await prisma.assignment.findUnique({ where: { id: requested.id } });
  expect(canceled?.status).toBe('CANCELED');
  expect(canceled?.respondedAt).not.toBeNull();

  const untouched = await prisma.assignment.findUnique({ where: { id: rejected.id } });
  expect(untouched?.status).toBe('REJECTED');
  expect(untouched?.respondedAt?.toISOString()).toBe(new Date('2020-01-01').toISOString());
  await ctx.dispose();
});

test('cancel 200 — RECEIVED·ACCEPTED·DISPATCHED 도 취소 대상이다', async ({ playwright }) => {
  const ctx = await adminCtx(playwright, 'cancel-states');
  for (const status of ['RECEIVED', 'ACCEPTED', 'DISPATCHED'] as const) {
    const req = await f.createRequestFixture({ status, address: ADDRESS });
    const res = await ctx.post(`/api/admin/requests/${req.id}/cancel`);
    expect(res.status(), status).toBe(200);
    expect((await prisma.serviceRequest.findUnique({ where: { id: req.id } }))?.status).toBe(
      'CANCELED',
    );
  }
  await ctx.dispose();
});

test('cancel 409 :18 — 완료·이미취소·미존재는 취소할 수 없다', async ({ playwright }) => {
  const ctx = await adminCtx(playwright, 'cancel-409');
  const completed = await f.createRequestFixture({ status: 'COMPLETED', address: ADDRESS });
  const canceled = await f.createRequestFixture({ status: 'CANCELED', address: ADDRESS });

  for (const [label, id] of [
    ['COMPLETED', completed.id],
    ['이미 CANCELED', canceled.id],
    ['미존재', 'e2e-no-such-request'],
  ] as const) {
    const res = await ctx.post(`/api/admin/requests/${id}/cancel`);
    expect(res.status(), label).toBe(409);
    expect((await res.json()).error, label).toBe('취소할 수 없는 상태입니다');
  }

  // 완료 건은 손대지 않았다 — 409 가 조용한 덮어쓰기가 아니었음을 확인한다.
  expect((await prisma.serviceRequest.findUnique({ where: { id: completed.id } }))?.status).toBe(
    'COMPLETED',
  );
  await ctx.dispose();
});
