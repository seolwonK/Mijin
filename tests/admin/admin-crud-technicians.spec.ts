import { expect, test, type APIRequestContext } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { apiContextOptions } from '../helpers/auth';
import { FixtureFactory, ephemeralLoginId, ephemeralPhone } from '../helpers/fixtures';
import { GATES, expectGate } from '../helpers/gates';

// ───────────────────────────────────────────────────────────────────────────
// 계약: 관리자 기술자 CRUD (계획 Step 7 — V* / H1 / S1)
//
//   src/app/api/admin/technicians/route.ts        GET + POST
//   src/app/api/admin/technicians/[id]/route.ts   GET + PATCH
//
// G1(무세션 401)·G2(타역할 401)는 tests/cross/auth-matrix.spec.ts 가 매트릭스로
// 전수 단언하므로 여기서 반복하지 않는다. 이 파일은 **4xx 분기 전수 + 2xx +
// DB 부수효과**만 본다. 각 테스트 제목에 커버하는 소스 라인을 적는다.
//
// 병렬 안전성: 단언은 전부 **이 스펙이 만든 id 로 스코프**된다. 9001 대역 전체를
// 세는 단언은 쓰지 않는다 — 다른 워커의 살아있는 픽스처를 잡아 정리 실패로 오인된다
// (계획 rev.5 "하네스 결함 1건" 참조).
// ───────────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();
test.afterAll(async () => {
  await prisma.$disconnect();
});

const PASSWORD = 'e2epass1234';

let f: FixtureFactory;
let admin: APIRequestContext;
/** POST 로 생성될 수 있는 계정. 테스트가 중간에 죽어도 회수되도록 미리 등록한다. */
let pendingLoginIds: string[];

function newLoginId(): string {
  const id = ephemeralLoginId('tech');
  pendingLoginIds.push(id);
  return id;
}

function techBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    loginId: newLoginId(),
    password: PASSWORD,
    name: 'E2E 등록기술자',
    phone: ephemeralPhone(),
    // 좌표를 직접 주면 geocode() 호출 분기를 건너뛴다 (:79-92).
    address: '서울특별시 강남구 테헤란로 152',
    employmentType: 'DAILY',
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

// ── GET /api/admin/technicians ─────────────────────────────────────────────

test('technicians GET 200 — 목록 항목 shape 와 내 픽스처의 값이 일치한다', async () => {
  const tech = await f.createTechFixture({
    contractStatus: 'CONFIRMED',
    address: '서울특별시 강남구 테헤란로 2',
  });

  const res = await admin.get('/api/admin/technicians');
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { technicians: Array<Record<string, unknown>> };
  expect(Array.isArray(body.technicians)).toBe(true);

  const row = body.technicians.find((t) => t.id === tech.technicianId);
  expect(row, '방금 만든 기술자가 목록에 없다').toBeTruthy();
  // 핸들러가 명시적으로 매핑하는 키 집합 — 키가 늘거나 빠지면 여기서 잡힌다.
  expect(Object.keys(row!).sort()).toEqual(
    [
      'address',
      'appliedAt',
      'approvalStatus',
      'contractStatus',
      'employmentType',
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
    loginId: tech.loginId,
    name: tech.name,
    phone: tech.phone,
    address: '서울특별시 강남구 테헤란로 2',
    isActive: true,
    employmentType: 'DAILY',
    approvalStatus: 'APPROVED',
    contractStatus: 'CONFIRMED',
  });
});

// ── POST /api/admin/technicians — 4xx 분기 ─────────────────────────────────

test('technicians POST 400 (:66) — 본문이 JSON 이 아니다', async () => {
  const res = await admin.post('/api/admin/technicians', {
    headers: { 'content-type': 'application/json' },
    // 문자열을 그대로 주면 Playwright 가 JSON 으로 직렬화해 버려
    // req.json() 이 성공한다 (그러면 zod 400 이지 파싱 400 이 아니다).
    // 이 분기를 실제로 태우려면 원시 바이트를 보내야 한다.
    data: Buffer.from('{ this is not json'),
  });
  expect(res.status()).toBe(400);
  expect(await res.json()).toMatchObject({ error: '잘못된 요청입니다' });
});

test('technicians POST 400 (:72) — zod 검증 실패 메시지가 그대로 나온다', async () => {
  const short = await admin.post('/api/admin/technicians', { data: techBody({ loginId: 'ab' }) });
  expect(short.status()).toBe(400);
  expect(await short.json()).toMatchObject({ error: '아이디는 3자 이상' });

  const weak = await admin.post('/api/admin/technicians', { data: techBody({ password: '1234' }) });
  expect(weak.status()).toBe(400);
  expect(await weak.json()).toMatchObject({ error: '비밀번호는 8자 이상' });

  const phone = await admin.post('/api/admin/technicians', { data: techBody({ phone: '12' }) });
  expect(phone.status()).toBe(400);
  expect(await phone.json()).toMatchObject({ error: '전화번호 형식이 올바르지 않습니다' });

  const type = await admin.post('/api/admin/technicians', {
    data: techBody({ employmentType: 'CONTRACT' }),
  });
  expect(type.status()).toBe(400);
  // ⚠️ 여기서 `error` 가 truthy 인지만 보면 :87/:115/:120 어느 400 이 걸려도 통과한다.
  // zod 위임 분기는 문구가 입력마다 달라 고정 단언이 불가능하므로(gates.ts message:null),
  // **이 핸들러의 어떤 고정 문구 분기와도 겹칠 수 없는** 패턴으로 특정한다.
  expect((await type.json()).error).toMatch(/DAILY|PERMANENT|option|enum/i);
});

test('technicians POST 400 (:87) — 좌표를 생략했고 주소를 변환하지 못했다', async () => {
  // lat/lng 를 빼면 geocode(address) 를 실제로 호출한다(카카오 실호출 유지, 계획 §확정 제약).
  // 변환 불가 주소이거나 키가 없으면 두 경우 모두 null → 이 분기로 떨어진다.
  const body = techBody({ address: '존재하지않는주소ㅁㄴㅇㄹㅋㅌㅊㅍ 999999번지' });
  delete body.lat;
  delete body.lng;

  const res = await admin.post('/api/admin/technicians', { data: body });
  expect(res.status()).toBe(400);
  expect(await res.json()).toMatchObject({ needManualCoords: true });
});

test('technicians POST 400 (:115) — 추천인이 없거나 승인/활성 상태가 아니다', async () => {
  const missing = await admin.post('/api/admin/technicians', {
    data: techBody({ referrerUserId: 'e2e-no-such-user-id' }),
  });
  expect(missing.status()).toBe(400);
  expect(await missing.json()).toMatchObject({ error: '추천인을 찾을 수 없습니다' });

  const pending = await f.createTechFixture({ approvalStatus: 'PENDING' });
  const notApproved = await admin.post('/api/admin/technicians', {
    data: techBody({ referrerUserId: pending.userId }),
  });
  expect(notApproved.status()).toBe(400);
  expect(await notApproved.json()).toMatchObject({ error: '추천인을 찾을 수 없습니다' });

  const inactive = await f.createTechFixture({ approvalStatus: 'APPROVED', isActive: false });
  const notActive = await admin.post('/api/admin/technicians', {
    data: techBody({ referrerUserId: inactive.userId }),
  });
  expect(notActive.status()).toBe(400);
  expect(await notActive.json()).toMatchObject({ error: '추천인을 찾을 수 없습니다' });
});

test('technicians POST 400 (:120) — 추천인 전화번호가 신청자와 같다 (자기 추천)', async () => {
  const referrer = await f.createTechFixture();
  const res = await admin.post('/api/admin/technicians', {
    data: techBody({ referrerUserId: referrer.userId, phone: referrer.phone }),
  });
  expect(res.status()).toBe(400);
  expect(await res.json()).toMatchObject({ error: '본인을 추천인으로 지정할 수 없습니다' });
});

test('technicians POST 409 (:154) — loginId 중복', async () => {
  const body = techBody();
  const first = await admin.post('/api/admin/technicians', { data: body });
  expect(first.status()).toBe(200);

  const second = await admin.post('/api/admin/technicians', {
    data: { ...techBody(), loginId: body.loginId },
  });
  expect(second.status()).toBe(409);
  expect(await second.json()).toMatchObject({ error: '이미 사용 중인 아이디입니다' });

  // 부수효과: 중복 시도는 계정을 하나도 더 만들지 않는다.
  expect(await prisma.user.count({ where: { loginId: body.loginId as string } })).toBe(1);
});

// ── POST /api/admin/technicians — 2xx + 부수효과 ───────────────────────────

test('technicians POST 200 — 즉시 APPROVED 로 생성되고 추천인이 기록된다 (S1)', async () => {
  const referrer = await f.createTechFixture();
  const body = techBody({ memo: '관리자 직접 등록', referrerUserId: referrer.userId });

  const res = await admin.post('/api/admin/technicians', { data: body });
  expect(res.status()).toBe(200);
  const created = (await res.json()) as { id: string };
  expect(typeof created.id).toBe('string');

  const row = await prisma.technician.findUnique({
    where: { id: created.id },
    include: { user: true },
  });
  expect(row).toBeTruthy();
  expect(row!.approvalStatus).toBe('APPROVED');
  expect(row!.approvedAt).not.toBeNull();
  expect(row!.employmentType).toBe('DAILY');
  expect(row!.address).toBe(body.address);
  expect(row!.lat).toBeCloseTo(body.lat as number, 6);
  expect(row!.lng).toBeCloseTo(body.lng as number, 6);
  expect(row!.memo).toBe('관리자 직접 등록');
  expect(row!.referredByUserId).toBe(referrer.userId);
  expect(row!.user.role).toBe('TECHNICIAN');
  expect(row!.user.loginId).toBe(body.loginId);
  expect(row!.user.phone).toBe(body.phone);
  expect(await bcrypt.compare(PASSWORD, row!.user.passwordHash)).toBe(true);

  // 계약은 생성되지 않는다 — 배정 후보 진입은 CONFIRMED 계약이 별도로 필요하다
  // (src/lib/matching.ts:54).
  expect(await prisma.employmentContract.count({ where: { technicianId: created.id } })).toBe(0);
});

// ── GET /api/admin/technicians/[id] ────────────────────────────────────────

test('technicians/[id] GET 404 (:43) — 없는 id', async () => {
  const res = await admin.get('/api/admin/technicians/e2e-no-such-technician');
  expect(res.status()).toBe(404);
  expect(await res.json()).toMatchObject({ error: '기술자를 찾을 수 없습니다' });
});

test('technicians/[id] GET 200 — 상세 shape · 리뷰 0건 기본값 · 소개자 표시', async () => {
  const referrer = await f.createPartnerFixture();
  const tech = await f.createTechFixture({
    contractStatus: 'SUBMITTED',
    regions: ['서울특별시 강남구'],
  });
  await prisma.technician.update({
    where: { id: tech.technicianId },
    data: { referredByUserId: referrer.userId },
  });

  const res = await admin.get(`/api/admin/technicians/${tech.technicianId}`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as Record<string, unknown>;

  expect(Object.keys(body).sort()).toEqual(
    [
      'address',
      'appliedAt',
      'approvalStatus',
      'avgRating',
      'contractStatus',
      'employmentType',
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
    id: tech.technicianId,
    loginId: tech.loginId,
    contractStatus: 'SUBMITTED',
    regions: ['서울특별시 강남구'],
    // 리뷰가 0건이면 avgRating 은 null 이다 (:91 의 `_count > 0` 게이트).
    reviewCount: 0,
    avgRating: null,
    reviews: [],
    referredBy: { userId: referrer.userId, name: referrer.name, type: '업체' },
  });
});

// ── PATCH /api/admin/technicians/[id] — 4xx 분기 ───────────────────────────

test('technicians/[id] PATCH 400 (:108) — 본문이 JSON 이 아니다', async () => {
  const tech = await f.createTechFixture();
  const res = await admin.patch(`/api/admin/technicians/${tech.technicianId}`, {
    headers: { 'content-type': 'application/json' },
    data: Buffer.from('not json at all'),
  });
  expect(res.status()).toBe(400);
  expect(await res.json()).toMatchObject({ error: '잘못된 요청입니다' });
});

test('technicians/[id] PATCH 400 (:114) — zod 검증 실패', async () => {
  const tech = await f.createTechFixture();
  const bad = await admin.patch(`/api/admin/technicians/${tech.technicianId}`, {
    data: { phone: '123' },
  });
  expect(bad.status()).toBe(400);
  expect(await bad.json()).toMatchObject({ error: '전화번호 형식이 올바르지 않습니다' });

  const shortPw = await admin.patch(`/api/admin/technicians/${tech.technicianId}`, {
    data: { password: 'short' },
  });
  expect(shortPw.status()).toBe(400);
  expect(await shortPw.json()).toMatchObject({ error: '비밀번호는 8자 이상' });
});

test('technicians/[id] PATCH 404 (:121) — 본문은 유효하지만 대상이 없다', async () => {
  const res = await admin.patch('/api/admin/technicians/e2e-no-such-technician', {
    data: { memo: '아무거나' },
  });
  expect(res.status()).toBe(404);
  expect(await res.json()).toMatchObject({ error: '기술자를 찾을 수 없습니다' });
});

test('technicians/[id] PATCH 400 (:155) — 소급 지정한 소개자가 유효하지 않다', async () => {
  const tech = await f.createTechFixture();
  const rejected = await f.createPartnerFixture({ approvalStatus: 'REJECTED' });

  const missing = await admin.patch(`/api/admin/technicians/${tech.technicianId}`, {
    data: { referredByUserId: 'e2e-no-such-user-id' },
  });
  expect(missing.status()).toBe(400);
  expect(await missing.json()).toMatchObject({ error: '추천인을 찾을 수 없습니다' });

  const notApproved = await admin.patch(`/api/admin/technicians/${tech.technicianId}`, {
    data: { referredByUserId: rejected.userId },
  });
  expect(notApproved.status()).toBe(400);
  expect(await notApproved.json()).toMatchObject({ error: '추천인을 찾을 수 없습니다' });

  // 거절된 분기는 아무것도 쓰지 않는다.
  expect(
    (await prisma.technician.findUnique({ where: { id: tech.technicianId } }))!.referredByUserId,
  ).toBeNull();
});

test('technicians/[id] PATCH 400 (:160) — 자기 자신을 소개자로 지정', async () => {
  const tech = await f.createTechFixture();
  const res = await admin.patch(`/api/admin/technicians/${tech.technicianId}`, {
    data: { referredByUserId: tech.userId },
  });
  expect(res.status()).toBe(400);
  expect(await res.json()).toMatchObject({ error: '본인을 추천인으로 지정할 수 없습니다' });
});

// ── PATCH /api/admin/technicians/[id] — 2xx + 부수효과 ─────────────────────

test('technicians/[id] PATCH 200 — Technician·User 양쪽이 갱신되고 지역이 정제된다 (S1)', async () => {
  const tech = await f.createTechFixture();
  const before = await prisma.user.findUnique({ where: { id: tech.userId } });

  const res = await admin.patch(`/api/admin/technicians/${tech.technicianId}`, {
    data: {
      name: 'E2E 수정된 기술자',
      phone: '01099990001',
      address: '서울특별시 서초구 서초대로 1',
      isActive: false,
      memo: '수정 메모',
      employmentType: 'PERMANENT',
      // zod 는 string[] 만 받고(:21), 그 뒤 sanitizeRegionKeys 가 유효한 키만 남기고
      // 중복을 제거한다 (src/lib/regions.ts:98-109).
      regions: ['서울특별시 강남구', '없는시도 없는구', '서울특별시 강남구'],
      password: 'newpass12345',
    },
  });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });

  const after = await prisma.technician.findUnique({
    where: { id: tech.technicianId },
    include: { user: true },
  });
  expect(after).toMatchObject({
    address: '서울특별시 서초구 서초대로 1',
    isActive: false,
    memo: '수정 메모',
    employmentType: 'PERMANENT',
    regions: ['서울특별시 강남구'],
  });
  expect(after!.user.name).toBe('E2E 수정된 기술자');
  expect(after!.user.phone).toBe('01099990001');
  expect(after!.user.passwordHash).not.toBe(before!.passwordHash);
  expect(await bcrypt.compare('newpass12345', after!.user.passwordHash)).toBe(true);
});

test('technicians/[id] PATCH 200 — 소개자 지정 후 null 로 해제된다 (S1)', async () => {
  const tech = await f.createTechFixture();
  const referrer = await f.createTechFixture();

  const set = await admin.patch(`/api/admin/technicians/${tech.technicianId}`, {
    data: { referredByUserId: referrer.userId },
  });
  expect(set.status()).toBe(200);
  expect(
    (await prisma.technician.findUnique({ where: { id: tech.technicianId } }))!.referredByUserId,
  ).toBe(referrer.userId);

  const clear = await admin.patch(`/api/admin/technicians/${tech.technicianId}`, {
    data: { referredByUserId: null },
  });
  expect(clear.status()).toBe(200);
  expect(
    (await prisma.technician.findUnique({ where: { id: tech.technicianId } }))!.referredByUserId,
  ).toBeNull();
});

// ── 게이트 결박 ────────────────────────────────────────────────────────────
// 위 테스트들은 분기를 **문구로** 특정한다 (같은 400 이 5개인 핸들러라 상태코드만으로는
// 어느 분기를 때렸는지 알 수 없다 — tests/helpers/gates.ts 머리말의 false-green).
// 그 문구를 손으로 적어둔 이상, 제품이 문구를 바꾸면 단언이 조용히 무의미해질 수 있다.
// 여기서 그림자 지도와 대조해 그 가능성을 없앤다:
//   · gates.ts ↔ 제품 소스 대조 = tests/cross/gate-map.spec.ts
//   · gates.ts ↔ 이 스펙의 문구 대조 = 아래
// 겸해서 이 스펙이 커버하는 4xx 분기 목록(=커버리지 증거)이 한자리에 남는다.
test('gate map 결박 — 이 스펙이 커버하는 분기와 문구가 gates.ts 와 일치한다', () => {
  const covered: Array<[string, number, number, string | null]> = [
    ['POST /api/admin/technicians', 66, 400, '잘못된 요청입니다'],
    ['POST /api/admin/technicians', 72, 400, null], // zod 위임 — 입력별 문구를 개별 단언
    ['POST /api/admin/technicians', 87, 400, '주소를 좌표로 변환하지 못했습니다. 위도/경도를 직접 입력해 주세요.'],
    ['POST /api/admin/technicians', 115, 400, '추천인을 찾을 수 없습니다'],
    ['POST /api/admin/technicians', 120, 400, '본인을 추천인으로 지정할 수 없습니다'],
    ['POST /api/admin/technicians', 154, 409, '이미 사용 중인 아이디입니다'],
    ['GET /api/admin/technicians/[id]', 43, 404, '기술자를 찾을 수 없습니다'],
    ['PATCH /api/admin/technicians/[id]', 108, 400, '잘못된 요청입니다'],
    ['PATCH /api/admin/technicians/[id]', 114, 400, null],
    ['PATCH /api/admin/technicians/[id]', 121, 404, '기술자를 찾을 수 없습니다'],
    ['PATCH /api/admin/technicians/[id]', 155, 400, '추천인을 찾을 수 없습니다'],
    ['PATCH /api/admin/technicians/[id]', 160, 400, '본인을 추천인으로 지정할 수 없습니다'],
  ];
  for (const [handler, line, status, message] of covered) {
    const gate = expectGate(handler, line);
    expect(gate.status, `${handler} :${line}`).toBe(status);
    expect(gate.message, `${handler} :${line}`).toBe(message);
  }
  // 지도가 아는 비401 분기를 하나도 빠뜨리지 않았는지 — 제품에 분기가 늘면 여기서 빨개진다.
  for (const handler of [
    'POST /api/admin/technicians',
    'GET /api/admin/technicians/[id]',
    'PATCH /api/admin/technicians/[id]',
  ]) {
    expect(
      GATES[handler].gates.map((g) => g.line).sort((a, b) => a - b),
      `${handler} 의 4xx 분기 중 커버하지 않은 것이 있다`,
    ).toEqual(covered.filter(([h]) => h === handler).map(([, line]) => line).sort((a, b) => a - b));
  }
});
