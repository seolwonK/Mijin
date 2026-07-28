import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { FixtureFactory, type TechFixture } from '../helpers/fixtures';
import { adminCtx } from './admin-mutation-support';

// ───────────────────────────────────────────────────────────────────────────
// POST /api/admin/commissions/pay — 실계약 (계획 Step 7)
//
//   400 :22  본문이 JSON 아님
//   400 :26  union(entryIds | referrerUserId) 불충족
//   200 :38  PENDING → PAID updateMany, { paid: count } · 재요청은 0 (멱등)
// ───────────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();
test.afterAll(async () => prisma.$disconnect());

const ADDRESS = '서울특별시 강남구 테헤란로 5';

let f: FixtureFactory;
test.beforeEach(() => {
  f = new FixtureFactory(prisma);
});
test.afterEach(async () => {
  await f.cleanupAll();
});

/**
 * 적립 1건 = 완료 접수 1건 + 만족도 조사 1건 (surveyId 가 멱등 키).
 * XOR CHECK(commission_entry_one_target·satisfaction_survey_one_assignee) 때문에
 * providerId/technicianId 중 정확히 하나만 채워야 한다.
 */
async function createCommission(
  referrer: TechFixture,
  subject: TechFixture,
  status: 'PENDING' | 'PAID',
  amount = 4_000,
) {
  const req = await f.createRequestFixture({ status: 'COMPLETED', address: ADDRESS });
  const survey = await prisma.satisfactionSurvey.create({
    data: {
      requestId: req.id,
      token: `e2e-${req.id}`,
      technicianId: subject.technicianId,
      rating: 5,
      paidAmount: amount * 50,
      submittedAt: new Date(),
    },
  });
  return prisma.commissionEntry.create({
    data: {
      referrerUserId: referrer.userId,
      technicianId: subject.technicianId,
      surveyId: survey.id,
      requestId: req.id,
      baseAmount: amount * 50,
      amount,
      status,
      paidAt: status === 'PAID' ? new Date('2026-01-02T03:04:05.000Z') : null,
    },
  });
}

test('400 :22/:26 — 깨진 JSON 과 형식 불충족', async ({ playwright }) => {
  const ctx = await adminCtx(playwright, 'commissions-400');
  const url = '/api/admin/commissions/pay';

  // Buffer 로 줘야 한다 — 문자열이면 Playwright 가 JSON.stringify 로 감싸 유효해진다.
  const badJson = await ctx.post(url, {
    headers: { 'content-type': 'application/json' },
    data: Buffer.from('{"entryIds":'),
  });
  expect(badJson.status()).toBe(400);
  expect((await badJson.json()).error).toBe('잘못된 요청입니다');

  for (const body of [
    {},
    { entryIds: [] },
    { entryIds: 'not-an-array' },
    { referrerUserId: '' },
    { referrer: 'wrong-key' },
  ]) {
    const res = await ctx.post(url, { data: body });
    expect(res.status(), JSON.stringify(body)).toBe(400);
    expect((await res.json()).error, JSON.stringify(body)).toBe('요청 형식이 올바르지 않습니다');
  }
  await ctx.dispose();
});

test('200 — entryIds 지급은 지정한 건만 PAID 로 바꾸고 재요청은 0을 돌려준다', async ({
  playwright,
}) => {
  const ctx = await adminCtx(playwright, 'commissions-entryids');
  const referrer = await f.createTechFixture();
  const subject = await f.createTechFixture();
  const target = await createCommission(referrer, subject, 'PENDING');
  const untouched = await createCommission(referrer, subject, 'PENDING');

  const res = await ctx.post('/api/admin/commissions/pay', {
    data: { entryIds: [target.id] },
  });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ paid: 1 });

  const paid = await prisma.commissionEntry.findUnique({ where: { id: target.id } });
  expect(paid?.status).toBe('PAID');
  expect(paid?.paidAt).not.toBeNull();
  expect(paid?.amount).toBe(target.amount);

  const other = await prisma.commissionEntry.findUnique({ where: { id: untouched.id } });
  expect(other?.status).toBe('PENDING');
  expect(other?.paidAt).toBeNull();

  // 멱등 — 이미 PAID 인 건은 where 에 걸리지 않아 count 가 늘지 않고 paidAt 도 그대로다.
  const paidAtBefore = paid?.paidAt?.toISOString();
  const again = await ctx.post('/api/admin/commissions/pay', { data: { entryIds: [target.id] } });
  expect(await again.json()).toEqual({ paid: 0 });
  expect(
    (await prisma.commissionEntry.findUnique({ where: { id: target.id } }))?.paidAt?.toISOString(),
  ).toBe(paidAtBefore);

  // 존재하지 않는 id 는 404 가 아니라 paid: 0 이다 (updateMany 계약).
  expect(
    await (await ctx.post('/api/admin/commissions/pay', { data: { entryIds: ['e2e-no-such'] } })).json(),
  ).toEqual({ paid: 0 });
  await ctx.dispose();
});

test('200 — referrerUserId 지급은 그 소개자의 PENDING 만 일괄 처리한다', async ({ playwright }) => {
  const ctx = await adminCtx(playwright, 'commissions-referrer');
  const referrer = await f.createTechFixture();
  const otherReferrer = await f.createTechFixture();
  const subject = await f.createTechFixture();

  const a = await createCommission(referrer, subject, 'PENDING', 3_000);
  const b = await createCommission(referrer, subject, 'PENDING', 5_000);
  const alreadyPaid = await createCommission(referrer, subject, 'PAID', 1_000);
  const foreign = await createCommission(otherReferrer, subject, 'PENDING', 7_000);

  const res = await ctx.post('/api/admin/commissions/pay', {
    data: { referrerUserId: referrer.userId },
  });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ paid: 2 });

  for (const id of [a.id, b.id]) {
    const row = await prisma.commissionEntry.findUnique({ where: { id } });
    expect(row?.status).toBe('PAID');
    expect(row?.paidAt).not.toBeNull();
  }
  // 이미 PAID 였던 건의 paidAt 은 덮이지 않는다.
  expect(
    (await prisma.commissionEntry.findUnique({ where: { id: alreadyPaid.id } }))?.paidAt?.toISOString(),
  ).toBe('2026-01-02T03:04:05.000Z');
  // 남의 소개 건은 그대로 PENDING.
  expect((await prisma.commissionEntry.findUnique({ where: { id: foreign.id } }))?.status).toBe(
    'PENDING',
  );

  const again = await ctx.post('/api/admin/commissions/pay', {
    data: { referrerUserId: referrer.userId },
  });
  expect(await again.json()).toEqual({ paid: 0 });
  await ctx.dispose();
});
