import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { FixtureFactory } from '../helpers/fixtures';
import { adminCtx } from './admin-mutation-support';

// ───────────────────────────────────────────────────────────────────────────
// GET·PUT /api/admin/technicians/[id]/contract — 실계약 (계획 Step 7)
//
//   GET  404 :44  전기기사 없음        · 200 :47 (계약 null 포함)
//   PUT  400 :72  본문이 JSON 아님
//        400 :78  adminWageSchema 실패
//        404 :89  근로확인서 미작성
//        409 :97  CONFIRMED 는 수정 불가
//        200 :120 임금·보험 저장 + 조건부 널 처리
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

test('GET 404 :44 / 200 :47 — 계약 없는 전기기사는 contract: null 로 응답한다', async ({
  playwright,
}) => {
  const ctx = await adminCtx(playwright, 'contract-get');

  const missing = await ctx.get('/api/admin/technicians/e2e-no-such/contract');
  expect(missing.status()).toBe(404);
  expect((await missing.json()).error).toBe('전기기사를 찾을 수 없습니다');

  const bare = await f.createTechFixture({ employmentType: 'PERMANENT' });
  const res = await ctx.get(`/api/admin/technicians/${bare.technicianId}/contract`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.technician).toMatchObject({
    id: bare.technicianId,
    name: bare.name,
    phone: bare.phone,
    employmentType: 'PERMANENT',
  });
  expect(body.contract).toBeNull();
  // 사용자 고용주 정보는 AppSettings 기본값 폴백을 갖는다 (route.ts:19-29).
  expect(typeof body.employer.name).toBe('string');
  expect(Object.keys(body.employer).sort()).toEqual(
    ['address', 'bizRegNo', 'ceo', 'name', 'phone', 'signatureDataUrl'].sort(),
  );

  const withContract = await f.createTechFixture({ contractStatus: 'SUBMITTED' });
  const start = new Date('2026-03-02T00:00:00.000Z');
  await prisma.employmentContract.update({
    where: { technicianId: withContract.technicianId },
    data: { contractStartDate: start },
  });
  const loaded = await ctx.get(`/api/admin/technicians/${withContract.technicianId}/contract`);
  expect(loaded.status()).toBe(200);
  const c = (await loaded.json()).contract;
  expect(c.status).toBe('SUBMITTED');
  // serialize() 가 날짜를 YYYY-MM-DD 로 자른다 (route.ts:7-17).
  expect(c.contractStartDate).toBe('2026-03-02');
  expect(c.contractEndDate).toBeNull();
  await ctx.dispose();
});

test('PUT 400 :72/:78 — 깨진 JSON 과 스키마 위반은 다른 문구로 거절된다', async ({
  playwright,
}) => {
  const ctx = await adminCtx(playwright, 'contract-put-400');
  const tech = await f.createTechFixture({ contractStatus: 'SUBMITTED' });
  const url = `/api/admin/technicians/${tech.technicianId}/contract`;

  // Buffer 로 줘야 한다 — 문자열이면 Playwright 가 JSON.stringify 로 감싸 유효해진다.
  const badJson = await ctx.put(url, {
    headers: { 'content-type': 'application/json' },
    data: Buffer.from('{"wageType":'),
  });
  expect(badJson.status()).toBe(400);
  expect((await badJson.json()).error).toBe('잘못된 요청입니다');

  // :78 은 zod 의 첫 issue 메시지를 그대로 흘린다.
  //
  // ⚠️ 여기서 `typeof error === 'string'` 만 보면 **위쪽 :72 가 대신 발동해도 통과한다**
  // ('잘못된 요청입니다' 도 문자열이다). PUT 의 400 은 :72 와 :78 둘뿐이므로
  // :72 의 문구를 배제하는 것이 곧 ":78 이 발동했다"의 증명이다.
  // zod 문구 자체를 박으면 zod 버전에 결박되므로 배제 형태를 쓴다.
  for (const body of [
    { wageType: 'WEEKLY' },
    { wageAmount: -1 },
    { payMethod: 'CASH' },
    { bonusExists: 'yes' },
    { otherPayDesc: 'ㄱ'.repeat(201) },
  ]) {
    const res = await ctx.put(url, { data: body });
    const label = JSON.stringify(body);
    expect(res.status(), label).toBe(400);
    const error = (await res.json()).error;
    expect(typeof error, label).toBe('string');
    expect(error, `${label} — :72(잘못된 JSON)가 대신 발동하면 :78 은 미검증이다`).not.toBe(
      '잘못된 요청입니다',
    );
  }

  // 부수효과 0
  const c = await prisma.employmentContract.findUnique({
    where: { technicianId: tech.technicianId },
  });
  expect(c?.wageType).toBeNull();
  expect(c?.wageAmount).toBeNull();
  await ctx.dispose();
});

test('PUT 404 :89 — 전기기사가 근로확인서를 아직 작성하지 않았다', async ({ playwright }) => {
  const ctx = await adminCtx(playwright, 'contract-put-404');
  const bare = await f.createTechFixture();

  const res = await ctx.put(`/api/admin/technicians/${bare.technicianId}/contract`, {
    data: { wageType: 'MONTHLY', wageAmount: 3_000_000 },
  });
  expect(res.status()).toBe(404);
  expect((await res.json()).error).toBe('전기기사가 아직 근로확인서를 작성하지 않았습니다');

  // 존재하지 않는 전기기사도 같은 404 다 — PUT 은 전기기사 존재를 따로 보지 않고
  // 근로확인서 유무만 본다(route.ts:83-91).
  const ghost = await ctx.put('/api/admin/technicians/e2e-no-such/contract', {
    data: { wageType: 'MONTHLY' },
  });
  expect(ghost.status()).toBe(404);
  expect((await ghost.json()).error).toBe('전기기사가 아직 근로확인서를 작성하지 않았습니다');
  await ctx.dispose();
});

test('PUT 409 :97 — 전기기사가 서명 완료한 근로확인서는 수정할 수 없다', async ({ playwright }) => {
  const ctx = await adminCtx(playwright, 'contract-put-409');
  const tech = await f.createTechFixture({ contractStatus: 'CONFIRMED' });

  const res = await ctx.put(`/api/admin/technicians/${tech.technicianId}/contract`, {
    data: { wageType: 'HOURLY', wageAmount: 12_000 },
  });
  expect(res.status()).toBe(409);
  expect((await res.json()).error).toBe('전기기사가 서명 완료한 근로확인서는 수정할 수 없습니다');

  const c = await prisma.employmentContract.findUnique({
    where: { technicianId: tech.technicianId },
  });
  expect(c?.status).toBe('CONFIRMED');
  expect(c?.wageType).toBeNull();
  await ctx.dispose();
});

test('PUT 200 :120 — 임금·보험이 저장되고 미체크 항목은 널로 정리된다', async ({ playwright }) => {
  const ctx = await adminCtx(playwright, 'contract-put-200');
  const tech = await f.createTechFixture({ contractStatus: 'SUBMITTED' });
  const url = `/api/admin/technicians/${tech.technicianId}/contract`;

  const res = await ctx.put(url, {
    data: {
      wageType: 'MONTHLY',
      wageAmount: 3_200_000,
      bonusExists: true,
      bonusAmount: 500_000,
      otherPayExists: true,
      otherPayDesc: '식대',
      otherPayAmount: 200_000,
      payDate: '매월 10일',
      payMethod: 'BANK_TRANSFER',
      insuranceEmployment: true,
      insuranceAccident: true,
      insurancePension: false,
      insuranceHealth: false,
    },
  });
  expect(res.status()).toBe(200);
  const saved = (await res.json()).contract;
  expect(saved.wageAmount).toBe(3_200_000);
  expect(saved.bonusAmount).toBe(500_000);
  expect(saved.otherPayDesc).toBe('식대');
  expect(saved.insurancePension).toBe(false);

  const stored = await prisma.employmentContract.findUnique({
    where: { technicianId: tech.technicianId },
  });
  expect(stored?.wageType).toBe('MONTHLY');
  expect(stored?.payMethod).toBe('BANK_TRANSFER');
  expect(stored?.payDate).toBe('매월 10일');
  // 확정은 전기기사 서명으로만 이뤄지므로 PUT 은 status 를 건드리지 않는다.
  expect(stored?.status).toBe('SUBMITTED');

  // 조건부 널 처리 (route.ts:107-110) — 체크를 끄면 금액이 남지 않는다.
  const cleared = await ctx.put(url, {
    data: {
      wageType: 'DAILY',
      wageAmount: 150_000,
      bonusExists: false,
      bonusAmount: 500_000,
      otherPayExists: false,
      otherPayDesc: '식대',
      otherPayAmount: 200_000,
    },
  });
  expect(cleared.status()).toBe(200);
  const after = await prisma.employmentContract.findUnique({
    where: { technicianId: tech.technicianId },
  });
  expect(after?.bonusAmount).toBeNull();
  expect(after?.otherPayDesc).toBeNull();
  expect(after?.otherPayAmount).toBeNull();
  // 스키마 기본값이 true 라, 보내지 않은 보험 항목은 true 로 되돌아간다.
  expect(after?.insurancePension).toBe(true);
  await ctx.dispose();
});
