import { expect, test, type APIRequestContext } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { apiContextOptions } from '../helpers/auth';
import { FixtureFactory, ephemeralLoginId, ephemeralPhone } from '../helpers/fixtures';
import { GATES, expectGate } from '../helpers/gates';

// ───────────────────────────────────────────────────────────────────────────
// 계약: 관리자 업체 CRUD (계획 Step 7 — V* / H1 / S1)
//
//   src/app/api/admin/providers/route.ts        GET + POST
//   src/app/api/admin/providers/[id]/route.ts   GET + PATCH
//
// 전기기사 쪽과 거의 대칭이지만 두 가지가 다르다:
//   · 사업자등록번호 체크섬 분기(:78-84)가 추가로 있다
//   · employmentType 이 없다
// G1/G2 는 tests/cross/auth-matrix.spec.ts 가 전수 단언한다 (여기서 반복하지 않음).
// 단언은 전부 이 스펙이 만든 id 로 스코프된다 (병렬 워커 안전).
// ───────────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();
test.afterAll(async () => {
  await prisma.$disconnect();
});

const PASSWORD = 'e2epass1234';

/** 국세청 체크섬(src/lib/bizRegNo.ts:9-13)을 만족하는 10자리를 생성한다. */
function validBizRegNo(): string {
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const digits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += digits[i] * weights[i];
  sum += Math.floor((digits[8] * 5) / 10);
  return digits.join('') + String((10 - (sum % 10)) % 10);
}

let f: FixtureFactory;
let admin: APIRequestContext;
let pendingLoginIds: string[];

function newLoginId(): string {
  const id = ephemeralLoginId('partner');
  pendingLoginIds.push(id);
  return id;
}

function providerBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    loginId: newLoginId(),
    password: PASSWORD,
    name: 'E2E 등록업체',
    phone: ephemeralPhone(),
    // 좌표를 직접 주면 geocode() 분기(:88-101)를 건너뛴다.
    address: '서울특별시 강남구 테헤란로 152',
    lat: 37.5006,
    lng: 127.0364,
    ...over,
  };
}

test.beforeEach(async ({ playwright }) => {
  f = new FixtureFactory(prisma);
  pendingLoginIds = [];
  admin = await playwright.request.newContext(await apiContextOptions('ADMIN'));
});

test.afterEach(async () => {
  await admin.dispose();
  const created = await prisma.user.findMany({
    where: { loginId: { in: pendingLoginIds } },
    select: { id: true },
  });
  for (const user of created) f.trackUser(user.id);
  await f.cleanupAll();
});

// ── GET /api/admin/providers ───────────────────────────────────────────────

test('providers GET 200 — 목록 항목 shape 와 내 픽스처의 값이 일치한다', async () => {
  const bizRegNo = validBizRegNo();
  const partner = await f.createPartnerFixture({
    bizRegNo,
    address: '서울특별시 강남구 테헤란로 3',
  });

  const res = await admin.get('/api/admin/providers');
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { providers: Array<Record<string, unknown>> };
  expect(Array.isArray(body.providers)).toBe(true);

  const row = body.providers.find((p) => p.id === partner.providerId);
  expect(row, '방금 만든 업체가 목록에 없다').toBeTruthy();
  expect(Object.keys(row!).sort()).toEqual(
    [
      'address',
      'appliedAt',
      'approvalStatus',
      'bizRegNo',
      'hasCert',
      'id',
      'isActive',
      'lat',
      'lng',
      'loginId',
      'memo',
      'name',
      'phone',
      'rejectReason',
    ].sort(),
  );
  expect(row).toMatchObject({
    loginId: partner.loginId,
    name: partner.name,
    phone: partner.phone,
    address: '서울특별시 강남구 테헤란로 3',
    isActive: true,
    approvalStatus: 'APPROVED',
    bizRegNo,
    // 사업자등록증 파일을 붙이지 않았으므로 false (:48 의 `!!(fileId || path)`).
    hasCert: false,
  });
});

// ── POST /api/admin/providers — 4xx 분기 ───────────────────────────────────

test('providers POST 400 (:64) — 본문이 JSON 이 아니다', async () => {
  const res = await admin.post('/api/admin/providers', {
    headers: { 'content-type': 'application/json' },
    // 원시 바이트로 보내야 req.json() 이 실제로 throw 한다 (문자열은 JSON 직렬화됨).
    data: Buffer.from('<<not json>>'),
  });
  expect(res.status()).toBe(400);
  expect(await res.json()).toMatchObject({ error: '잘못된 요청입니다' });
});

test('providers POST 400 (:70) — zod 검증 실패 메시지가 그대로 나온다', async () => {
  const short = await admin.post('/api/admin/providers', { data: providerBody({ loginId: 'ab' }) });
  expect(short.status()).toBe(400);
  expect(await short.json()).toMatchObject({ error: '아이디는 3자 이상' });

  const weak = await admin.post('/api/admin/providers', { data: providerBody({ password: '1234' }) });
  expect(weak.status()).toBe(400);
  expect(await weak.json()).toMatchObject({ error: '비밀번호는 8자 이상' });

  const noName = await admin.post('/api/admin/providers', { data: providerBody({ name: '   ' }) });
  expect(noName.status()).toBe(400);
  expect(await noName.json()).toMatchObject({ error: '업체명을 입력해 주세요' });

  const phone = await admin.post('/api/admin/providers', { data: providerBody({ phone: '12' }) });
  expect(phone.status()).toBe(400);
  expect(await phone.json()).toMatchObject({ error: '전화번호 형식이 올바르지 않습니다' });
});

test('providers POST 400 (:81) — 사업자등록번호 체크섬 불일치', async () => {
  // 형식(숫자 10자리)은 맞지만 검증번호가 틀린 값.
  const invalid = '1234567890';
  const res = await admin.post('/api/admin/providers', {
    data: providerBody({ bizRegNo: invalid }),
  });
  expect(res.status()).toBe(400);
  expect(await res.json()).toMatchObject({ error: '사업자등록번호가 올바르지 않습니다' });

  // 자릿수 부족도 같은 분기.
  const tooShort = await admin.post('/api/admin/providers', {
    data: providerBody({ bizRegNo: '123-45' }),
  });
  expect(tooShort.status()).toBe(400);
  expect(await tooShort.json()).toMatchObject({ error: '사업자등록번호가 올바르지 않습니다' });
});

test('providers POST 400 (:96) — 좌표를 생략했고 주소를 변환하지 못했다', async () => {
  const body = providerBody({ address: '존재하지않는주소ㅁㄴㅇㄹㅋㅌㅊㅍ 999999번지' });
  delete body.lat;
  delete body.lng;

  const res = await admin.post('/api/admin/providers', { data: body });
  expect(res.status()).toBe(400);
  expect(await res.json()).toMatchObject({ needManualCoords: true });
});

test('providers POST 400 (:124) — 추천인이 없거나 승인/활성 상태가 아니다', async () => {
  const missing = await admin.post('/api/admin/providers', {
    data: providerBody({ referrerUserId: 'e2e-no-such-user-id' }),
  });
  expect(missing.status()).toBe(400);
  expect(await missing.json()).toMatchObject({ error: '추천인을 찾을 수 없습니다' });

  const pending = await f.createPartnerFixture({ approvalStatus: 'PENDING' });
  const notApproved = await admin.post('/api/admin/providers', {
    data: providerBody({ referrerUserId: pending.userId }),
  });
  expect(notApproved.status()).toBe(400);
  expect(await notApproved.json()).toMatchObject({ error: '추천인을 찾을 수 없습니다' });

  const inactive = await f.createPartnerFixture({ isActive: false });
  const notActive = await admin.post('/api/admin/providers', {
    data: providerBody({ referrerUserId: inactive.userId }),
  });
  expect(notActive.status()).toBe(400);
  expect(await notActive.json()).toMatchObject({ error: '추천인을 찾을 수 없습니다' });
});

test('providers POST 400 (:129) — 추천인 전화번호가 신청자와 같다 (자기 추천)', async () => {
  const referrer = await f.createPartnerFixture();
  const res = await admin.post('/api/admin/providers', {
    data: providerBody({ referrerUserId: referrer.userId, phone: referrer.phone }),
  });
  expect(res.status()).toBe(400);
  expect(await res.json()).toMatchObject({ error: '본인을 추천인으로 지정할 수 없습니다' });
});

test('providers POST 409 (:163) — loginId 중복 · bizRegNo 중복', async () => {
  const body = providerBody({ bizRegNo: validBizRegNo() });
  const first = await admin.post('/api/admin/providers', { data: body });
  expect(first.status()).toBe(200);

  const dupLogin = await admin.post('/api/admin/providers', {
    data: { ...providerBody(), loginId: body.loginId },
  });
  expect(dupLogin.status()).toBe(409);
  expect(await dupLogin.json()).toMatchObject({
    error: '이미 사용 중인 아이디 또는 사업자등록번호입니다',
  });

  // Provider.bizRegNo 도 unique 라 같은 P2002 분기로 떨어진다 (prisma/schema.prisma:103).
  const dupBiz = await admin.post('/api/admin/providers', {
    data: providerBody({ bizRegNo: body.bizRegNo }),
  });
  expect(dupBiz.status()).toBe(409);
  expect(await dupBiz.json()).toMatchObject({
    error: '이미 사용 중인 아이디 또는 사업자등록번호입니다',
  });

  expect(await prisma.user.count({ where: { loginId: body.loginId as string } })).toBe(1);
  expect(await prisma.provider.count({ where: { bizRegNo: body.bizRegNo as string } })).toBe(1);
});

// ── POST /api/admin/providers — 2xx + 부수효과 ─────────────────────────────

test('providers POST 200 — 즉시 APPROVED 로 생성되고 사업자번호가 정규화된다 (S1)', async () => {
  const referrer = await f.createPartnerFixture();
  const bizRegNo = validBizRegNo();
  // 하이픈이 섞인 입력은 normalizeBizRegNo 가 숫자만 남긴다 (:77).
  const hyphenated = `${bizRegNo.slice(0, 3)}-${bizRegNo.slice(3, 5)}-${bizRegNo.slice(5)}`;
  const body = providerBody({
    memo: '관리자 직접 등록',
    bizRegNo: hyphenated,
    referrerUserId: referrer.userId,
  });

  const res = await admin.post('/api/admin/providers', { data: body });
  expect(res.status()).toBe(200);
  const created = (await res.json()) as { id: string };
  expect(typeof created.id).toBe('string');

  const row = await prisma.provider.findUnique({
    where: { id: created.id },
    include: { user: true },
  });
  expect(row).toBeTruthy();
  expect(row!.approvalStatus).toBe('APPROVED');
  expect(row!.approvedAt).not.toBeNull();
  expect(row!.address).toBe(body.address);
  expect(row!.lat).toBeCloseTo(body.lat as number, 6);
  expect(row!.lng).toBeCloseTo(body.lng as number, 6);
  expect(row!.memo).toBe('관리자 직접 등록');
  expect(row!.bizRegNo).toBe(bizRegNo);
  expect(row!.referredByUserId).toBe(referrer.userId);
  expect(row!.user.role).toBe('PROVIDER');
  expect(row!.user.loginId).toBe(body.loginId);
  expect(await bcrypt.compare(PASSWORD, row!.user.passwordHash)).toBe(true);
});

test('providers POST 200 — bizRegNo 를 비우면 null 로 저장된다 (:76 의 빈 문자열 게이트)', async () => {
  const body = providerBody({ bizRegNo: '   ' });
  const res = await admin.post('/api/admin/providers', { data: body });
  expect(res.status()).toBe(200);
  const created = (await res.json()) as { id: string };
  expect((await prisma.provider.findUnique({ where: { id: created.id } }))!.bizRegNo).toBeNull();
});

// ── GET /api/admin/providers/[id] ──────────────────────────────────────────

test('providers/[id] GET 404 (:41) — 없는 id', async () => {
  const res = await admin.get('/api/admin/providers/e2e-no-such-provider');
  expect(res.status()).toBe(404);
  expect(await res.json()).toMatchObject({ error: '업체를 찾을 수 없습니다' });
});

test('providers/[id] GET 200 — 상세 shape · 리뷰 0건 기본값 · 소개자 표시', async () => {
  const referrer = await f.createTechFixture();
  const partner = await f.createPartnerFixture({ regions: ['서울특별시 강남구'] });
  await prisma.provider.update({
    where: { id: partner.providerId },
    data: { referredByUserId: referrer.userId },
  });

  const res = await admin.get(`/api/admin/providers/${partner.providerId}`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as Record<string, unknown>;

  expect(Object.keys(body).sort()).toEqual(
    [
      'address',
      'appliedAt',
      'approvalStatus',
      'avgRating',
      'bizRegNo',
      'hasCert',
      'id',
      'isActive',
      'lat',
      'lng',
      'loginId',
      'memo',
      'name',
      'phone',
      'referredBy',
      'regions',
      'rejectReason',
      'reviewCount',
      'reviews',
    ].sort(),
  );
  expect(body).toMatchObject({
    id: partner.providerId,
    loginId: partner.loginId,
    regions: ['서울특별시 강남구'],
    hasCert: false,
    reviewCount: 0,
    avgRating: null,
    reviews: [],
    referredBy: { userId: referrer.userId, name: referrer.name, type: '전기기사' },
  });
});

// ── PATCH /api/admin/providers/[id] — 4xx 분기 ─────────────────────────────

test('providers/[id] PATCH 400 (:106) — 본문이 JSON 이 아니다', async () => {
  const partner = await f.createPartnerFixture();
  const res = await admin.patch(`/api/admin/providers/${partner.providerId}`, {
    headers: { 'content-type': 'application/json' },
    data: Buffer.from('not json at all'),
  });
  expect(res.status()).toBe(400);
  expect(await res.json()).toMatchObject({ error: '잘못된 요청입니다' });
});

test('providers/[id] PATCH 400 (:112) — zod 검증 실패', async () => {
  const partner = await f.createPartnerFixture();
  const bad = await admin.patch(`/api/admin/providers/${partner.providerId}`, {
    data: { phone: '123' },
  });
  expect(bad.status()).toBe(400);
  expect(await bad.json()).toMatchObject({ error: '전화번호 형식이 올바르지 않습니다' });

  const shortPw = await admin.patch(`/api/admin/providers/${partner.providerId}`, {
    data: { password: 'short' },
  });
  expect(shortPw.status()).toBe(400);
  expect(await shortPw.json()).toMatchObject({ error: '비밀번호는 8자 이상' });
});

test('providers/[id] PATCH 404 (:119) — 본문은 유효하지만 대상이 없다', async () => {
  const res = await admin.patch('/api/admin/providers/e2e-no-such-provider', {
    data: { memo: '아무거나' },
  });
  expect(res.status()).toBe(404);
  expect(await res.json()).toMatchObject({ error: '업체를 찾을 수 없습니다' });
});

test('providers/[id] PATCH 400 (:152) — 소급 지정한 소개자가 유효하지 않다', async () => {
  const partner = await f.createPartnerFixture();
  const rejected = await f.createTechFixture({ approvalStatus: 'REJECTED' });

  const missing = await admin.patch(`/api/admin/providers/${partner.providerId}`, {
    data: { referredByUserId: 'e2e-no-such-user-id' },
  });
  expect(missing.status()).toBe(400);
  expect(await missing.json()).toMatchObject({ error: '추천인을 찾을 수 없습니다' });

  const notApproved = await admin.patch(`/api/admin/providers/${partner.providerId}`, {
    data: { referredByUserId: rejected.userId },
  });
  expect(notApproved.status()).toBe(400);
  expect(await notApproved.json()).toMatchObject({ error: '추천인을 찾을 수 없습니다' });

  expect(
    (await prisma.provider.findUnique({ where: { id: partner.providerId } }))!.referredByUserId,
  ).toBeNull();
});

test('providers/[id] PATCH 400 (:157) — 자기 자신을 소개자로 지정', async () => {
  const partner = await f.createPartnerFixture();
  const res = await admin.patch(`/api/admin/providers/${partner.providerId}`, {
    data: { referredByUserId: partner.userId },
  });
  expect(res.status()).toBe(400);
  expect(await res.json()).toMatchObject({ error: '본인을 추천인으로 지정할 수 없습니다' });
});

// ── PATCH /api/admin/providers/[id] — 2xx + 부수효과 ───────────────────────

test('providers/[id] PATCH 200 — Provider·User 양쪽이 갱신되고 지역이 정제된다 (S1)', async () => {
  const partner = await f.createPartnerFixture();
  const before = await prisma.user.findUnique({ where: { id: partner.userId } });

  const res = await admin.patch(`/api/admin/providers/${partner.providerId}`, {
    data: {
      name: 'E2E 수정된 업체',
      phone: '01099990002',
      address: '서울특별시 서초구 서초대로 2',
      isActive: false,
      memo: '수정 메모',
      regions: ['부산광역시', '없는시도 없는구', '부산광역시'],
      password: 'newpass12345',
    },
  });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });

  const after = await prisma.provider.findUnique({
    where: { id: partner.providerId },
    include: { user: true },
  });
  expect(after).toMatchObject({
    address: '서울특별시 서초구 서초대로 2',
    isActive: false,
    memo: '수정 메모',
    regions: ['부산광역시'],
  });
  expect(after!.user.name).toBe('E2E 수정된 업체');
  expect(after!.user.phone).toBe('01099990002');
  expect(after!.user.passwordHash).not.toBe(before!.passwordHash);
  expect(await bcrypt.compare('newpass12345', after!.user.passwordHash)).toBe(true);
});

test('providers/[id] PATCH 200 — 소개자 지정 후 null 로 해제된다 (S1)', async () => {
  const partner = await f.createPartnerFixture();
  const referrer = await f.createTechFixture();

  const set = await admin.patch(`/api/admin/providers/${partner.providerId}`, {
    data: { referredByUserId: referrer.userId },
  });
  expect(set.status()).toBe(200);
  expect(
    (await prisma.provider.findUnique({ where: { id: partner.providerId } }))!.referredByUserId,
  ).toBe(referrer.userId);

  const clear = await admin.patch(`/api/admin/providers/${partner.providerId}`, {
    data: { referredByUserId: null },
  });
  expect(clear.status()).toBe(200);
  expect(
    (await prisma.provider.findUnique({ where: { id: partner.providerId } }))!.referredByUserId,
  ).toBeNull();
});

// ── 게이트 결박 (전기기사 스펙의 같은 이름 테스트와 동일한 목적) ─────────────
test('gate map 결박 — 이 스펙이 커버하는 분기와 문구가 gates.ts 와 일치한다', () => {
  const covered: Array<[string, number, number, string | null]> = [
    ['POST /api/admin/providers', 64, 400, '잘못된 요청입니다'],
    ['POST /api/admin/providers', 70, 400, null], // zod 위임
    ['POST /api/admin/providers', 81, 400, '사업자등록번호가 올바르지 않습니다'],
    ['POST /api/admin/providers', 96, 400, '주소를 좌표로 변환하지 못했습니다. 위도/경도를 직접 입력해 주세요.'],
    ['POST /api/admin/providers', 124, 400, '추천인을 찾을 수 없습니다'],
    ['POST /api/admin/providers', 129, 400, '본인을 추천인으로 지정할 수 없습니다'],
    ['POST /api/admin/providers', 163, 409, '이미 사용 중인 아이디 또는 사업자등록번호입니다'],
    ['GET /api/admin/providers/[id]', 41, 404, '업체를 찾을 수 없습니다'],
    ['PATCH /api/admin/providers/[id]', 106, 400, '잘못된 요청입니다'],
    ['PATCH /api/admin/providers/[id]', 112, 400, null],
    ['PATCH /api/admin/providers/[id]', 119, 404, '업체를 찾을 수 없습니다'],
    ['PATCH /api/admin/providers/[id]', 152, 400, '추천인을 찾을 수 없습니다'],
    ['PATCH /api/admin/providers/[id]', 157, 400, '본인을 추천인으로 지정할 수 없습니다'],
  ];
  for (const [handler, line, status, message] of covered) {
    const gate = expectGate(handler, line);
    expect(gate.status, `${handler} :${line}`).toBe(status);
    expect(gate.message, `${handler} :${line}`).toBe(message);
  }
  for (const handler of [
    'POST /api/admin/providers',
    'GET /api/admin/providers/[id]',
    'PATCH /api/admin/providers/[id]',
  ]) {
    expect(
      GATES[handler].gates.map((g) => g.line).sort((a, b) => a - b),
      `${handler} 의 4xx 분기 중 커버하지 않은 것이 있다`,
    ).toEqual(covered.filter(([h]) => h === handler).map(([, line]) => line).sort((a, b) => a - b));
  }
});
